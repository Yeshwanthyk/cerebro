package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// DiffMode represents the type of diff to compute
type DiffMode string

const (
	// DiffModeBranch compares HEAD against a base branch (default)
	DiffModeBranch DiffMode = "branch"
	// DiffModeWorking shows all uncommitted changes (staged + unstaged)
	DiffModeWorking DiffMode = "working"
	// DiffModeStaged shows only staged changes (what would be committed)
	DiffModeStaged DiffMode = "staged"
)

type Repo struct {
	path string // Repository root path
}

type FileInfo struct {
	Path      string        `json:"path"`
	Status    string        `json:"status"`
	Additions int           `json:"additions"`
	Deletions int           `json:"deletions"`
	Patch     string        `json:"patch"`
	OldFile   *FileContents `json:"old_file,omitempty"`
	NewFile   *FileContents `json:"new_file,omitempty"`
}

type FileContents struct {
	Name     string `json:"name"`
	Contents string `json:"contents"`
}

// Open opens a git repository at the given path
func Open(path string) (*Repo, error) {
	// Find the repository root
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = path
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to find git repository: %w", err)
	}

	repoPath := strings.TrimSpace(string(out))
	return &Repo{path: repoPath}, nil
}

// CurrentBranch returns the current branch name
func (r *Repo) CurrentBranch() (string, error) {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = r.path
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get current branch: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// CurrentCommit returns the current HEAD commit hash
func (r *Repo) CurrentCommit() (string, error) {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = r.path
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get current commit: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// RepoPath returns the absolute path to the repository root
func (r *Repo) RepoPath() (string, error) {
	return filepath.Abs(r.path)
}

// GetRemoteURL returns the URL of the origin remote, or empty string if not found
func (r *Repo) GetRemoteURL() (string, error) {
	cmd := exec.Command("git", "remote", "get-url", "origin")
	cmd.Dir = r.path
	out, err := cmd.Output()
	if err != nil {
		// No origin remote
		return "", nil
	}
	return strings.TrimSpace(string(out)), nil
}

// GetDefaultBranch attempts to determine the repository's default branch
// by checking origin/HEAD, then falling back to common branch names
func (r *Repo) GetDefaultBranch() string {
	// Try to get default branch from origin/HEAD
	cmd := exec.Command("git", "symbolic-ref", "refs/remotes/origin/HEAD")
	cmd.Dir = r.path
	out, err := cmd.Output()
	if err == nil {
		ref := strings.TrimSpace(string(out))
		// Extract branch name from refs/remotes/origin/<branch>
		if strings.HasPrefix(ref, "refs/remotes/origin/") {
			return strings.TrimPrefix(ref, "refs/remotes/origin/")
		}
	}

	// Fallback: check if common branch names exist
	commonBranches := []string{"main", "master", "develop", "development"}
	for _, branch := range commonBranches {
		// Check remote branch first
		cmd = exec.Command("git", "show-ref", "--verify", "--quiet", "refs/remotes/origin/"+branch)
		cmd.Dir = r.path
		if cmd.Run() == nil {
			return branch
		}
		// Check local branch
		cmd = exec.Command("git", "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
		cmd.Dir = r.path
		if cmd.Run() == nil {
			return branch
		}
	}

	// Last resort: return "main" as a sensible default
	return "main"
}

// GetDiffFiles returns changed files between base branch and HEAD (branch mode)
func (r *Repo) GetDiffFiles(baseBranch string) ([]FileInfo, error) {
	// Find merge-base between base branch and HEAD
	mergeBase := r.getMergeBase(baseBranch)
	if mergeBase == "" {
		return nil, fmt.Errorf("failed to find merge base with %s", baseBranch)
	}

	// Get diff from merge-base to HEAD
	cmd := exec.Command("git", "diff", mergeBase+"...HEAD", "--no-color")
	cmd.Dir = r.path
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get diff: %w", err)
	}

	return parseDiffOutput(string(out)), nil
}

// GetWorkingTreeDiff returns all uncommitted changes (staged + unstaged)
func (r *Repo) GetWorkingTreeDiff() ([]FileInfo, error) {
	// Get diff of working tree against HEAD
	cmd := exec.Command("git", "diff", "HEAD", "--no-color")
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		// If HEAD doesn't exist (new repo), diff against empty tree
		cmd = exec.Command("git", "diff", "--cached", "--no-color")
		cmd.Dir = r.path
		output, err = cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("failed to get working tree diff: %w", err)
		}
	}

	// Get list of untracked files
	untrackedCmd := exec.Command("git", "ls-files", "--others", "--exclude-standard")
	untrackedCmd.Dir = r.path
	untrackedOutput, _ := untrackedCmd.Output()

	files := parseDiffOutput(string(output))

	// Add untracked files
	if len(untrackedOutput) > 0 {
		untrackedFiles := strings.Split(strings.TrimSpace(string(untrackedOutput)), "\n")
		for _, filePath := range untrackedFiles {
			if filePath == "" {
				continue
			}
			// Read file content for the patch
			content, err := os.ReadFile(filepath.Join(r.path, filePath))
			if err != nil {
				continue
			}
			lines := strings.Split(string(content), "\n")
			patch := fmt.Sprintf("diff --git a/%s b/%s\nnew file mode 100644\n--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n", filePath, filePath, filePath, len(lines))
			for _, line := range lines {
				patch += "+" + line + "\n"
			}
			files = append(files, FileInfo{
				Path:      filePath,
				Status:    "untracked",
				Additions: len(lines),
				Deletions: 0,
				Patch:     patch,
			})
		}
	}

	return files, nil
}

// GetStagedDiff returns only staged changes (what would be committed)
func (r *Repo) GetStagedDiff() ([]FileInfo, error) {
	cmd := exec.Command("git", "diff", "--cached", "--no-color")
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get staged diff: %w", err)
	}

	return parseDiffOutput(string(output)), nil
}

// HasUncommittedChanges checks if there are any uncommitted changes
func (r *Repo) HasUncommittedChanges() bool {
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(strings.TrimSpace(string(output))) > 0
}

// HasStagedChanges checks if there are any staged changes
func (r *Repo) HasStagedChanges() bool {
	cmd := exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = r.path
	err := cmd.Run()
	// Exit code 1 means there are changes
	return err != nil
}

// parseDiffOutput parses git diff output into FileInfo structs
func parseDiffOutput(diffOutput string) []FileInfo {
	files := []FileInfo{}
	if diffOutput == "" {
		return files
	}

	// Split by diff headers
	parts := strings.Split(diffOutput, "diff --git ")
	for _, part := range parts[1:] { // Skip first empty part
		lines := strings.Split(part, "\n")
		if len(lines) == 0 {
			continue
		}

		// Parse file path from "a/path b/path"
		header := lines[0]
		pathParts := strings.Split(header, " ")
		if len(pathParts) < 2 {
			continue
		}

		filePath := strings.TrimPrefix(pathParts[1], "b/")

		// Determine status
		status := "modified"
		fullPatch := "diff --git " + part

		if strings.Contains(part, "new file mode") {
			status = "added"
		} else if strings.Contains(part, "deleted file mode") {
			status = "deleted"
		} else if strings.Contains(part, "rename from") {
			status = "renamed"
		}

		// Count additions and deletions
		additions := 0
		deletions := 0
		for _, line := range lines {
			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				additions++
			} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
				deletions++
			}
		}

		files = append(files, FileInfo{
			Path:      filePath,
			Status:    status,
			Additions: additions,
			Deletions: deletions,
			Patch:     fullPatch,
		})
	}

	return files
}

// GetDiff returns files based on the specified mode
func (r *Repo) GetDiff(mode DiffMode, baseBranch string) ([]FileInfo, error) {
	switch mode {
	case DiffModeWorking:
		return r.GetWorkingTreeDiff()
	case DiffModeStaged:
		return r.GetStagedDiff()
	case DiffModeBranch:
		fallthrough
	default:
		return r.GetDiffFiles(baseBranch)
	}
}

// Stage adds a file to the staging area
func (r *Repo) Stage(filePath string) error {
	cmd := exec.Command("git", "add", filePath)
	cmd.Dir = r.path
	return cmd.Run()
}

// Unstage removes a file from the staging area
func (r *Repo) Unstage(filePath string) error {
	cmd := exec.Command("git", "reset", "HEAD", filePath)
	cmd.Dir = r.path
	return cmd.Run()
}

// Discard reverts a file to its last committed state, or deletes untracked files
func (r *Repo) Discard(filePath string) error {
	// First try git checkout (for tracked files)
	cmd := exec.Command("git", "checkout", "--", filePath)
	cmd.Dir = r.path
	err := cmd.Run()
	if err != nil {
		// If checkout fails, try git clean for untracked files
		cmd = exec.Command("git", "clean", "-f", filePath)
		cmd.Dir = r.path
		return cmd.Run()
	}
	return nil
}

// Commit creates a new commit with the staged changes
func (r *Repo) Commit(message string) error {
	cmd := exec.Command("git", "commit", "-m", message)
	cmd.Dir = r.path
	return cmd.Run()
}

// GetFileAtHEAD returns file contents at HEAD commit
func (r *Repo) GetFileAtHEAD(filePath string) (string, error) {
	cmd := exec.Command("git", "show", "HEAD:"+filePath)
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// GetFileAtRef returns file contents at a specific ref (branch, commit, etc)
func (r *Repo) GetFileAtRef(ref, filePath string) (string, error) {
	cmd := exec.Command("git", "show", ref+":"+filePath)
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// GetFileFromIndex returns file contents from the staging area
func (r *Repo) GetFileFromIndex(filePath string) (string, error) {
	cmd := exec.Command("git", "show", ":"+filePath)
	cmd.Dir = r.path
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// GetWorkingFile returns file contents from the working directory
func (r *Repo) GetWorkingFile(filePath string) (string, error) {
	content, err := os.ReadFile(filepath.Join(r.path, filePath))
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// maxFileSize is the threshold above which we skip embedding file contents (200KB)
const maxFileSize = 200 * 1024

// GetDiffWithContents returns diff with file contents for Precision Diffs
func (r *Repo) GetDiffWithContents(mode DiffMode, baseBranch string) ([]FileInfo, error) {
	files, err := r.GetDiff(mode, baseBranch)
	if err != nil {
		return nil, err
	}

	for i := range files {
		file := &files[i]

		// Skip large files
		if len(file.Patch) > maxFileSize {
			continue
		}

		switch mode {
		case DiffModeWorking:
			// Old = HEAD, New = working tree
			if file.Status != "added" && file.Status != "untracked" {
				if content, err := r.GetFileAtHEAD(file.Path); err == nil {
					file.OldFile = &FileContents{Name: file.Path, Contents: content}
				}
			}
			if file.Status != "deleted" {
				if content, err := r.GetWorkingFile(file.Path); err == nil {
					file.NewFile = &FileContents{Name: file.Path, Contents: content}
				}
			}

		case DiffModeStaged:
			// Old = HEAD, New = index (staged)
			if file.Status != "added" {
				if content, err := r.GetFileAtHEAD(file.Path); err == nil {
					file.OldFile = &FileContents{Name: file.Path, Contents: content}
				}
			}
			if file.Status != "deleted" {
				if content, err := r.GetFileFromIndex(file.Path); err == nil {
					file.NewFile = &FileContents{Name: file.Path, Contents: content}
				}
			}

		case DiffModeBranch:
			// Old = merge-base with baseBranch, New = HEAD
			mergeBase := r.getMergeBase(baseBranch)
			if file.Status != "added" && mergeBase != "" {
				if content, err := r.GetFileAtRef(mergeBase, file.Path); err == nil {
					file.OldFile = &FileContents{Name: file.Path, Contents: content}
				}
			}
			if file.Status != "deleted" {
				if content, err := r.GetWorkingFile(file.Path); err == nil {
					file.NewFile = &FileContents{Name: file.Path, Contents: content}
				}
			}
		}
	}

	return files, nil
}

// getMergeBase returns the merge-base commit hash between HEAD and baseBranch
func (r *Repo) getMergeBase(baseBranch string) string {
	// Try origin/baseBranch first, then baseBranch
	for _, ref := range []string{"origin/" + baseBranch, baseBranch} {
		cmd := exec.Command("git", "merge-base", ref, "HEAD")
		cmd.Dir = r.path
		output, err := cmd.Output()
		if err == nil {
			return strings.TrimSpace(string(output))
		}
	}
	return ""
}
