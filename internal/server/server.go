package server

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/tuist/guck/internal/git"
	"github.com/tuist/guck/internal/state"
)

//go:embed static/index.html
var indexHTML string

type AppState struct {
	RepoPath     string
	BaseBranch   string
	Mode         git.DiffMode // "branch", "working", "staged"
	StateManager *state.Manager
	mu           sync.Mutex
}

type DiffResponse struct {
	Files      []FileDiff `json:"files"`
	Branch     string     `json:"branch"`
	Commit     string     `json:"commit"`
	RepoPath   string     `json:"repo_path"`
	RemoteURL  string     `json:"remote_url,omitempty"`
	Mode       string     `json:"mode"`        // Current diff mode
	BaseBranch string     `json:"base_branch"` // Only relevant for branch mode
}

type FileDiff struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
	Viewed    bool   `json:"viewed"`
}

type MarkViewedRequest struct {
	FilePath string `json:"file_path"`
}

type AddCommentRequest struct {
	FilePath   string `json:"file_path"`
	LineNumber *int   `json:"line_number,omitempty"`
	Text       string `json:"text"`
}

type GetCommentsQuery struct {
	FilePath string `json:"file_path,omitempty"`
}

type ResolveCommentRequest struct {
	CommentID string `json:"comment_id"`
}

type AddNoteRequest struct {
	FilePath   string            `json:"file_path"`
	LineNumber *int              `json:"line_number,omitempty"`
	Text       string            `json:"text"`
	Author     string            `json:"author"`
	Type       string            `json:"type,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type DismissNoteRequest struct {
	NoteID string `json:"note_id"`
}

type StatusResponse struct {
	RepoPath string `json:"repo_path"`
	Branch   string `json:"branch"`
	Commit   string `json:"commit"`
}

func Start(port int, baseBranch string, mode string) error {
	gitRepo, err := git.Open(".")
	if err != nil {
		return err
	}

	repoPath, err := gitRepo.RepoPath()
	if err != nil {
		return err
	}

	stateMgr, err := state.NewManager()
	if err != nil {
		return err
	}

	// Convert mode string to DiffMode
	diffMode := git.DiffModeBranch
	switch mode {
	case "working":
		diffMode = git.DiffModeWorking
	case "staged":
		diffMode = git.DiffModeStaged
	}

	appState := &AppState{
		RepoPath:     repoPath,
		BaseBranch:   baseBranch,
		Mode:         diffMode,
		StateManager: stateMgr,
	}

	r := mux.NewRouter()
	r.HandleFunc("/", appState.indexHandler).Methods("GET")
	r.HandleFunc("/api/diff", appState.diffHandler).Methods("GET")
	r.HandleFunc("/api/mark-viewed", appState.markViewedHandler).Methods("POST")
	r.HandleFunc("/api/unmark-viewed", appState.unmarkViewedHandler).Methods("POST")
	r.HandleFunc("/api/status", appState.statusHandler).Methods("GET")
	r.HandleFunc("/api/comments", appState.getCommentsHandler).Methods("GET")
	r.HandleFunc("/api/comments", appState.addCommentHandler).Methods("POST")
	r.HandleFunc("/api/comments/resolve", appState.resolveCommentHandler).Methods("POST")
	r.HandleFunc("/api/notes", appState.getNotesHandler).Methods("GET")
	r.HandleFunc("/api/notes", appState.addNoteHandler).Methods("POST")
	r.HandleFunc("/api/notes/dismiss", appState.dismissNoteHandler).Methods("POST")

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	fmt.Printf("Starting server on http://%s\n", addr)
	fmt.Printf("Mode: %s", mode)
	if mode == "branch" {
		fmt.Printf(" (comparing against %s)", baseBranch)
	}
	fmt.Println()

	return http.ListenAndServe(addr, r)
}

func (s *AppState) indexHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	_, _ = w.Write([]byte(indexHTML)) // Ignore write error for HTTP response
}

func (s *AppState) diffHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	remoteURL, _ := gitRepo.GetRemoteURL() // Ignore error, remote is optional

	// Check if mode is overridden via query param
	mode := s.Mode
	if modeParam := r.URL.Query().Get("mode"); modeParam != "" {
		switch modeParam {
		case "working":
			mode = git.DiffModeWorking
		case "staged":
			mode = git.DiffModeStaged
		case "branch":
			mode = git.DiffModeBranch
		}
	}

	files, err := gitRepo.GetDiff(mode, s.BaseBranch)
	if err != nil {
		// Check if it's a "branch not found" error (only relevant for branch mode)
		errMsg := err.Error()
		if strings.Contains(errMsg, "reference not found") || strings.Contains(errMsg, "failed to find branch") {
			detectedBranch := gitRepo.GetDefaultBranch()
			http.Error(w, fmt.Sprintf(
				"Base branch '%s' not found. This repository's default branch appears to be '%s'. "+
					"Please configure guck with: guck config set base-branch %s",
				s.BaseBranch, detectedBranch, detectedBranch,
			), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// For working/staged modes, use a synthetic commit identifier
	stateCommit := currentCommit
	if mode == git.DiffModeWorking {
		stateCommit = "working"
	} else if mode == git.DiffModeStaged {
		stateCommit = "staged"
	}

	fileDiffs := []FileDiff{}
	for _, file := range files {
		viewed := s.StateManager.IsFileViewed(s.RepoPath, currentBranch, stateCommit, file.Path)

		fileDiffs = append(fileDiffs, FileDiff{
			Path:      file.Path,
			Status:    file.Status,
			Additions: file.Additions,
			Deletions: file.Deletions,
			Patch:     file.Patch,
			Viewed:    viewed,
		})
	}

	response := DiffResponse{
		Files:      fileDiffs,
		Branch:     currentBranch,
		Commit:     currentCommit,
		RepoPath:   s.RepoPath,
		RemoteURL:  remoteURL,
		Mode:       string(mode),
		BaseBranch: s.BaseBranch,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response) // Ignore encode error for HTTP response
}

func (s *AppState) markViewedHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload MarkViewedRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.StateManager.MarkFileViewed(s.RepoPath, currentBranch, currentCommit, payload.FilePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *AppState) unmarkViewedHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload MarkViewedRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.StateManager.UnmarkFileViewed(s.RepoPath, currentBranch, currentCommit, payload.FilePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *AppState) statusHandler(w http.ResponseWriter, r *http.Request) {
	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := StatusResponse{
		RepoPath: s.RepoPath,
		Branch:   currentBranch,
		Commit:   currentCommit,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response) // Ignore encode error for HTTP response
}

func (s *AppState) getCommentsHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	filePath := r.URL.Query().Get("file_path")
	var filePathPtr *string
	if filePath != "" {
		filePathPtr = &filePath
	}

	comments := s.StateManager.GetComments(s.RepoPath, currentBranch, currentCommit, filePathPtr)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(comments) // Ignore encode error for HTTP response
}

func (s *AppState) addCommentHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload AddCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	comment, err := s.StateManager.AddComment(s.RepoPath, currentBranch, currentCommit, payload.FilePath, payload.LineNumber, payload.Text)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(comment) // Ignore encode error for HTTP response
}

func (s *AppState) resolveCommentHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload ResolveCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.StateManager.ResolveComment(s.RepoPath, currentBranch, currentCommit, payload.CommentID, "web-ui"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *AppState) getNotesHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	filePath := r.URL.Query().Get("file_path")
	var filePathPtr *string
	if filePath != "" {
		filePathPtr = &filePath
	}

	// Check mode - for working/staged modes, get all notes for the branch
	// This ensures notes are visible regardless of which mode you're viewing
	mode := r.URL.Query().Get("mode")
	var notes []*state.Note

	if mode == "working" || mode == "staged" {
		// Get notes across all commits for this branch
		notes = s.StateManager.GetNotesForBranch(s.RepoPath, currentBranch, filePathPtr)
	} else {
		// Branch mode - get notes for specific commit
		currentCommit, err := gitRepo.CurrentCommit()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		notes = s.StateManager.GetNotes(s.RepoPath, currentBranch, currentCommit, filePathPtr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(notes) // Ignore encode error for HTTP response
}

func (s *AppState) addNoteHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload AddNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Default type to "explanation" if not provided
	noteType := payload.Type
	if noteType == "" {
		noteType = "explanation"
	}

	note, err := s.StateManager.AddNote(
		s.RepoPath,
		currentBranch,
		currentCommit,
		payload.FilePath,
		payload.LineNumber,
		payload.Text,
		payload.Author,
		noteType,
		payload.Metadata,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(note) // Ignore encode error for HTTP response
}

func (s *AppState) dismissNoteHandler(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload DismissNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	gitRepo, err := git.Open(".")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentBranch, err := gitRepo.CurrentBranch()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	currentCommit, err := gitRepo.CurrentCommit()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.StateManager.DismissNote(s.RepoPath, currentBranch, currentCommit, payload.NoteID, "web-ui"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
