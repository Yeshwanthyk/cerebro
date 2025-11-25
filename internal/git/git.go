package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
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
	repo *git.Repository
}

type FileInfo struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
}

func Open(path string) (*Repo, error) {
	repo, err := git.PlainOpenWithOptions(path, &git.PlainOpenOptions{
		DetectDotGit: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to find git repository: %w", err)
	}

	return &Repo{repo: repo}, nil
}

func (r *Repo) CurrentBranch() (string, error) {
	head, err := r.repo.Head()
	if err != nil {
		return "", fmt.Errorf("failed to get HEAD: %w", err)
	}

	if !head.Name().IsBranch() {
		return "HEAD", nil
	}

	return head.Name().Short(), nil
}

func (r *Repo) CurrentCommit() (string, error) {
	head, err := r.repo.Head()
	if err != nil {
		return "", fmt.Errorf("failed to get HEAD: %w", err)
	}

	return head.Hash().String(), nil
}

func (r *Repo) RepoPath() (string, error) {
	wt, err := r.repo.Worktree()
	if err != nil {
		return "", fmt.Errorf("failed to get worktree: %w", err)
	}

	absPath, err := filepath.Abs(wt.Filesystem.Root())
	if err != nil {
		return "", fmt.Errorf("failed to get absolute path: %w", err)
	}

	return absPath, nil
}

// GetRemoteURL returns the URL of the origin remote, or empty string if not found
func (r *Repo) GetRemoteURL() (string, error) {
	remote, err := r.repo.Remote("origin")
	if err != nil {
		// No origin remote, return empty string
		return "", nil
	}

	if len(remote.Config().URLs) == 0 {
		return "", nil
	}

	return remote.Config().URLs[0], nil
}

// GetDefaultBranch attempts to determine the repository's default branch
// by checking origin/HEAD, then falling back to common branch names
func (r *Repo) GetDefaultBranch() string {
	// Try to get the default branch from origin/HEAD
	// This works when origin/HEAD is a symbolic ref pointing to origin/<branch>
	headRef, err := r.repo.Reference(plumbing.ReferenceName("refs/remotes/origin/HEAD"), false)
	if err == nil && headRef.Type() == plumbing.SymbolicReference {
		// Extract branch name from the target (e.g., refs/remotes/origin/master -> master)
		target := headRef.Target().String()
		if strings.HasPrefix(target, "refs/remotes/origin/") {
			return strings.TrimPrefix(target, "refs/remotes/origin/")
		}
	}

	// Fallback: check if common branch names exist
	commonBranches := []string{"main", "master", "develop", "development"}
	for _, branch := range commonBranches {
		// Check remote branch first
		if _, err := r.repo.Reference(plumbing.NewRemoteReferenceName("origin", branch), true); err == nil {
			return branch
		}
		// Check local branch
		if _, err := r.repo.Reference(plumbing.NewBranchReferenceName(branch), true); err == nil {
			return branch
		}
	}

	// Last resort: return "main" as a sensible default
	return "main"
}

func (r *Repo) GetDiffFiles(baseBranch string) ([]FileInfo, error) {
	// Try to get the remote tracking branch first (origin/baseBranch)
	// This ensures we compare against the remote version even if local is outdated
	remoteBranchRef, err := r.repo.Reference(plumbing.NewRemoteReferenceName("origin", baseBranch), true)

	var baseCommit *object.Commit
	if err == nil {
		// Remote tracking branch exists, use it
		baseCommit, err = r.repo.CommitObject(remoteBranchRef.Hash())
		if err != nil {
			return nil, fmt.Errorf("failed to get remote base commit: %w", err)
		}
	} else {
		// Fall back to local branch if remote tracking branch doesn't exist
		baseBranchRef, err := r.repo.Reference(plumbing.NewBranchReferenceName(baseBranch), true)
		if err != nil {
			return nil, fmt.Errorf("failed to find branch %s: %w", baseBranch, err)
		}

		baseCommit, err = r.repo.CommitObject(baseBranchRef.Hash())
		if err != nil {
			return nil, fmt.Errorf("failed to get base commit: %w", err)
		}
	}

	// Get the current HEAD commit
	head, err := r.repo.Head()
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD: %w", err)
	}

	headCommit, err := r.repo.CommitObject(head.Hash())
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD commit: %w", err)
	}

	// Find the merge base between base branch and HEAD
	mergeBase, err := headCommit.MergeBase(baseCommit)
	if err != nil {
		return nil, fmt.Errorf("failed to find merge base: %w", err)
	}

	// Use the merge base as the comparison point
	var baseTree *object.Tree
	if len(mergeBase) > 0 {
		baseTree, err = mergeBase[0].Tree()
		if err != nil {
			return nil, fmt.Errorf("failed to get merge base tree: %w", err)
		}
	} else {
		// Fallback to base branch if no merge base found
		baseTree, err = baseCommit.Tree()
		if err != nil {
			return nil, fmt.Errorf("failed to get base tree: %w", err)
		}
	}

	headTree, err := headCommit.Tree()
	if err != nil {
		return nil, fmt.Errorf("failed to get HEAD tree: %w", err)
	}

	// Get the diff
	changes, err := baseTree.Diff(headTree)
	if err != nil {
		return nil, fmt.Errorf("failed to create diff: %w", err)
	}

	files := []FileInfo{}

	for _, change := range changes {
		patch, err := change.Patch()
		if err != nil {
			continue
		}

		filePath := change.To.Name
		if filePath == "" {
			filePath = change.From.Name
		}

		status := "modified"
		switch {
		case change.From.Name == "":
			status = "added"
		case change.To.Name == "":
			status = "deleted"
		case change.From.Name != change.To.Name:
			status = "renamed"
		}

		// Count additions and deletions from the patch string
		additions := 0
		deletions := 0
		patchStr := patch.String()

		lines := strings.Split(patchStr, "\n")
		for _, line := range lines {
			if len(line) == 0 {
				continue
			}
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
			Patch:     patchStr,
		})
	}

	return files, nil
}

// GetWorkingTreeDiff returns all uncommitted changes (staged + unstaged)
// Uses git command for accurate working tree diffs since go-git has limitations
func (r *Repo) GetWorkingTreeDiff() ([]FileInfo, error) {
	repoPath, err := r.RepoPath()
	if err != nil {
		return nil, err
	}

	// Get diff of working tree against HEAD
	cmd := exec.Command("git", "diff", "HEAD", "--no-color")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		// If HEAD doesn't exist (new repo), diff against empty tree
		cmd = exec.Command("git", "diff", "--cached", "--no-color")
		cmd.Dir = repoPath
		output, err = cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("failed to get working tree diff: %w", err)
		}
	}

	// Get list of untracked files
	untrackedCmd := exec.Command("git", "ls-files", "--others", "--exclude-standard")
	untrackedCmd.Dir = repoPath
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
			content, err := os.ReadFile(filepath.Join(repoPath, filePath))
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
	repoPath, err := r.RepoPath()
	if err != nil {
		return nil, err
	}

	// Get diff of staged changes
	cmd := exec.Command("git", "diff", "--cached", "--no-color")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get staged diff: %w", err)
	}

	return parseDiffOutput(string(output)), nil
}

// HasUncommittedChanges checks if there are any uncommitted changes
func (r *Repo) HasUncommittedChanges() bool {
	repoPath, err := r.RepoPath()
	if err != nil {
		return false
	}

	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	return len(strings.TrimSpace(string(output))) > 0
}

// HasStagedChanges checks if there are any staged changes
func (r *Repo) HasStagedChanges() bool {
	repoPath, err := r.RepoPath()
	if err != nil {
		return false
	}

	cmd := exec.Command("git", "diff", "--cached", "--quiet")
	cmd.Dir = repoPath
	err = cmd.Run()
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
