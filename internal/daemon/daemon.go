package daemon

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

type Info struct {
	PID        int    `json:"pid"`
	Port       int    `json:"port"`
	RepoPath   string `json:"repo_path"`
	BaseBranch string `json:"base_branch"`
}

type Registry struct {
	Daemons map[string]*Info `json:"daemons"`
}

type Manager struct {
	registryPath string
	stateDir     string
}

func NewManager() (*Manager, error) {
	stateDir, err := getStateDir()
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create state directory: %w", err)
	}

	registryPath := filepath.Join(stateDir, "daemon-registry.json")

	return &Manager{
		registryPath: registryPath,
		stateDir:     stateDir,
	}, nil
}

func (m *Manager) loadRegistry() (*Registry, error) {
	registry := &Registry{
		Daemons: make(map[string]*Info),
	}

	if _, err := os.Stat(m.registryPath); err == nil {
		data, err := os.ReadFile(m.registryPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read registry: %w", err)
		}

		if err := json.Unmarshal(data, registry); err != nil {
			// If unmarshal fails, return empty registry
			return &Registry{Daemons: make(map[string]*Info)}, nil
		}
	}

	return registry, nil
}

func (m *Manager) saveRegistry(registry *Registry) error {
	data, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize registry: %w", err)
	}

	if err := os.WriteFile(m.registryPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write registry: %w", err)
	}

	return nil
}

func (m *Manager) FindAvailablePort() (int, error) {
	registry, err := m.loadRegistry()
	if err != nil {
		return 0, err
	}

	usedPorts := make(map[int]bool)
	for _, info := range registry.Daemons {
		usedPorts[info.Port] = true
	}

	maxAttempts := 100
	for i := 0; i < maxAttempts; i++ {
		port := rand.Intn(6000) + 3000 // Range: 3000-9000

		if !usedPorts[port] && isPortAvailable(port) {
			return port, nil
		}
	}

	return 0, fmt.Errorf("could not find an available port after %d attempts", maxAttempts)
}

func isPortAvailable(port int) bool {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

func (m *Manager) GetDaemonForRepo(repoPath string) (*Info, error) {
	registry, err := m.loadRegistry()
	if err != nil {
		return nil, err
	}

	if info, ok := registry.Daemons[repoPath]; ok {
		return info, nil
	}

	return nil, nil
}

func (m *Manager) RegisterDaemon(info *Info) error {
	registry, err := m.loadRegistry()
	if err != nil {
		return err
	}

	registry.Daemons[info.RepoPath] = info
	return m.saveRegistry(registry)
}

func (m *Manager) UnregisterDaemon(repoPath string) error {
	registry, err := m.loadRegistry()
	if err != nil {
		return err
	}

	delete(registry.Daemons, repoPath)
	return m.saveRegistry(registry)
}

func (m *Manager) ListDaemons() ([]*Info, error) {
	registry, err := m.loadRegistry()
	if err != nil {
		return nil, err
	}

	var daemons []*Info
	for _, info := range registry.Daemons {
		daemons = append(daemons, info)
	}

	return daemons, nil
}

func (m *Manager) IsDaemonRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// Send signal 0 to check if process exists
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

func (m *Manager) StopDaemon(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("failed to find process: %w", err)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to send SIGTERM: %w", err)
	}

	return nil
}

func (m *Manager) CleanupStaleDaemons() error {
	registry, err := m.loadRegistry()
	if err != nil {
		return err
	}

	for repoPath, info := range registry.Daemons {
		if !m.IsDaemonRunning(info.PID) {
			delete(registry.Daemons, repoPath)
		}
	}

	return m.saveRegistry(registry)
}

func (m *Manager) GetLogPath(repoPath string) string {
	// Create a safe filename from repo path
	safeName := strings.ReplaceAll(repoPath, "/", "_")
	safeName = strings.ReplaceAll(safeName, "\\", "_")
	safeName = strings.ReplaceAll(safeName, ":", "_")

	return filepath.Join(m.stateDir, fmt.Sprintf("%s.log", safeName))
}

func getStateDir() (string, error) {
	// Use XDG_STATE_HOME on Unix, or fallback to XDG_DATA_HOME/LocalAppData
	if stateHome := os.Getenv("XDG_STATE_HOME"); stateHome != "" {
		return filepath.Join(stateHome, "guck"), nil
	}

	if dataHome := os.Getenv("XDG_DATA_HOME"); dataHome != "" {
		return filepath.Join(dataHome, "guck"), nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to determine home directory: %w", err)
	}

	// Platform-specific defaults
	return filepath.Join(home, ".local", "state", "guck"), nil
}
