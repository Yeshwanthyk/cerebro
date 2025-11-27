package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// testRepo creates a temporary git repository for testing
// Returns the repo path and a cleanup function
func testRepo(t *testing.T) (string, func()) {
	t.Helper()

	dir, err := os.MkdirTemp("", "cerebro-git-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	cleanup := func() {
		os.RemoveAll(dir)
	}

	// Initialize git repo
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@test.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@test.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v failed: %v\n%s", args, err, out)
		}
	}

	run("init")
	run("config", "user.email", "test@test.com")
	run("config", "user.name", "Test")

	// Create initial commit on main branch
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Test Repo\n"), 0644); err != nil {
		cleanup()
		t.Fatalf("failed to write README: %v", err)
	}
	run("add", "README.md")
	run("commit", "-m", "Initial commit")

	return dir, cleanup
}

// TestOpen tests opening a git repository
func TestOpen(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	if repo == nil {
		t.Fatal("expected non-nil repo")
	}
}

// TestOpenNotARepo tests opening a non-git directory
func TestOpenNotARepo(t *testing.T) {
	dir, err := os.MkdirTemp("", "not-a-repo-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(dir)

	_, err = Open(dir)
	if err == nil {
		t.Fatal("expected error for non-git directory")
	}
}

// TestCurrentBranch tests getting the current branch name
func TestCurrentBranch(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	branch, err := repo.CurrentBranch()
	if err != nil {
		t.Fatalf("CurrentBranch failed: %v", err)
	}

	// Should be main or master depending on git version
	if branch != "main" && branch != "master" {
		t.Errorf("expected main or master, got %q", branch)
	}
}

// TestCurrentCommit tests getting the current commit hash
func TestCurrentCommit(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	commit, err := repo.CurrentCommit()
	if err != nil {
		t.Fatalf("CurrentCommit failed: %v", err)
	}

	// Should be a 40-char hex string
	if len(commit) != 40 {
		t.Errorf("expected 40-char commit hash, got %d chars: %q", len(commit), commit)
	}
}

// TestRepoPath tests getting the repository root path
func TestRepoPath(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	// Open from a subdirectory
	subdir := filepath.Join(dir, "subdir")
	if err := os.MkdirAll(subdir, 0755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}

	repo, err := Open(subdir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	repoPath, err := repo.RepoPath()
	if err != nil {
		t.Fatalf("RepoPath failed: %v", err)
	}

	// Should return the root, not the subdir
	// Use EvalSymlinks to handle macOS /var -> /private/var symlink
	absDir, _ := filepath.Abs(dir)
	absDir, _ = filepath.EvalSymlinks(absDir)
	repoPath, _ = filepath.EvalSymlinks(repoPath)
	if repoPath != absDir {
		t.Errorf("expected %q, got %q", absDir, repoPath)
	}
}

// TestGetDefaultBranch tests auto-detecting the default branch
func TestGetDefaultBranch(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	branch := repo.GetDefaultBranch()

	// Should find main or master
	if branch != "main" && branch != "master" {
		t.Errorf("expected main or master, got %q", branch)
	}
}

// TestHasUncommittedChanges tests detecting uncommitted changes
func TestHasUncommittedChanges(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Initially no uncommitted changes
	if repo.HasUncommittedChanges() {
		t.Error("expected no uncommitted changes initially")
	}

	// Modify a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Modified\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	// Now should have uncommitted changes
	if !repo.HasUncommittedChanges() {
		t.Error("expected uncommitted changes after modification")
	}
}

// TestHasStagedChanges tests detecting staged changes
func TestHasStagedChanges(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Initially no staged changes
	if repo.HasStagedChanges() {
		t.Error("expected no staged changes initially")
	}

	// Modify and stage a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Modified\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	cmd := exec.Command("git", "add", "README.md")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Fatalf("git add failed: %v", err)
	}

	// Now should have staged changes
	if !repo.HasStagedChanges() {
		t.Error("expected staged changes after git add")
	}
}

// TestGetWorkingTreeDiff tests getting uncommitted changes
func TestGetWorkingTreeDiff(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Initially no diff
	files, err := repo.GetWorkingTreeDiff()
	if err != nil {
		t.Fatalf("GetWorkingTreeDiff failed: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 files, got %d", len(files))
	}

	// Modify a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Modified\nNew line\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	// Should see the change
	files, err = repo.GetWorkingTreeDiff()
	if err != nil {
		t.Fatalf("GetWorkingTreeDiff failed: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file, got %d", len(files))
	}
	if len(files) > 0 {
		if files[0].Path != "README.md" {
			t.Errorf("expected README.md, got %q", files[0].Path)
		}
		if files[0].Status != "modified" {
			t.Errorf("expected modified status, got %q", files[0].Status)
		}
	}
}

// TestGetWorkingTreeDiff_Untracked tests detecting untracked files
func TestGetWorkingTreeDiff_Untracked(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Create a new untracked file
	newFile := filepath.Join(dir, "newfile.txt")
	if err := os.WriteFile(newFile, []byte("new content\n"), 0644); err != nil {
		t.Fatalf("failed to create new file: %v", err)
	}

	files, err := repo.GetWorkingTreeDiff()
	if err != nil {
		t.Fatalf("GetWorkingTreeDiff failed: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file, got %d", len(files))
	}
	if len(files) > 0 {
		if files[0].Path != "newfile.txt" {
			t.Errorf("expected newfile.txt, got %q", files[0].Path)
		}
		if files[0].Status != "untracked" {
			t.Errorf("expected untracked status, got %q", files[0].Status)
		}
	}
}

// TestGetStagedDiff tests getting staged changes
func TestGetStagedDiff(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Initially no staged diff
	files, err := repo.GetStagedDiff()
	if err != nil {
		t.Fatalf("GetStagedDiff failed: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 files, got %d", len(files))
	}

	// Modify and stage a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Staged change\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	cmd := exec.Command("git", "add", "README.md")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Fatalf("git add failed: %v", err)
	}

	// Should see the staged change
	files, err = repo.GetStagedDiff()
	if err != nil {
		t.Fatalf("GetStagedDiff failed: %v", err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file, got %d", len(files))
	}
	if len(files) > 0 && files[0].Path != "README.md" {
		t.Errorf("expected README.md, got %q", files[0].Path)
	}
}

// TestStageAndUnstage tests staging and unstaging files
func TestStageAndUnstage(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Modify a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Modified\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	// Stage it
	if err := repo.Stage("README.md"); err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	if !repo.HasStagedChanges() {
		t.Error("expected staged changes after Stage()")
	}

	// Unstage it
	if err := repo.Unstage("README.md"); err != nil {
		t.Fatalf("Unstage failed: %v", err)
	}

	if repo.HasStagedChanges() {
		t.Error("expected no staged changes after Unstage()")
	}
}

// TestDiscard tests discarding changes
func TestDiscard(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Modify a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Modified\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	if !repo.HasUncommittedChanges() {
		t.Fatal("expected uncommitted changes")
	}

	// Discard changes
	if err := repo.Discard("README.md"); err != nil {
		t.Fatalf("Discard failed: %v", err)
	}

	if repo.HasUncommittedChanges() {
		t.Error("expected no uncommitted changes after Discard()")
	}

	// Verify content was restored
	content, err := os.ReadFile(readme)
	if err != nil {
		t.Fatalf("failed to read README: %v", err)
	}
	if string(content) != "# Test Repo\n" {
		t.Errorf("expected original content, got %q", string(content))
	}
}

// TestCommit tests creating a commit
func TestCommit(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	initialCommit, _ := repo.CurrentCommit()

	// Modify and stage a file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Committed change\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}
	if err := repo.Stage("README.md"); err != nil {
		t.Fatalf("Stage failed: %v", err)
	}

	// Commit
	if err := repo.Commit("Test commit"); err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// Should have a new commit
	newCommit, _ := repo.CurrentCommit()
	if newCommit == initialCommit {
		t.Error("expected new commit hash after Commit()")
	}

	// Should have no staged changes
	if repo.HasStagedChanges() {
		t.Error("expected no staged changes after Commit()")
	}
}

// TestGetFileAtHEAD tests getting file contents at HEAD
func TestGetFileAtHEAD(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	content, err := repo.GetFileAtHEAD("README.md")
	if err != nil {
		t.Fatalf("GetFileAtHEAD failed: %v", err)
	}

	if content != "# Test Repo\n" {
		t.Errorf("expected '# Test Repo\\n', got %q", content)
	}
}

// TestGetWorkingFile tests getting file contents from working directory
func TestGetWorkingFile(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Modify the file
	readme := filepath.Join(dir, "README.md")
	if err := os.WriteFile(readme, []byte("# Working copy\n"), 0644); err != nil {
		t.Fatalf("failed to modify README: %v", err)
	}

	content, err := repo.GetWorkingFile("README.md")
	if err != nil {
		t.Fatalf("GetWorkingFile failed: %v", err)
	}

	if content != "# Working copy\n" {
		t.Errorf("expected '# Working copy\\n', got %q", content)
	}
}

// TestGetDiff_AllModes tests GetDiff with all modes
func TestGetDiff_AllModes(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Test working mode
	files, err := repo.GetDiff(DiffModeWorking, "main")
	if err != nil {
		t.Fatalf("GetDiff(working) failed: %v", err)
	}
	if files == nil {
		t.Error("expected non-nil files for working mode")
	}

	// Test staged mode
	files, err = repo.GetDiff(DiffModeStaged, "main")
	if err != nil {
		t.Fatalf("GetDiff(staged) failed: %v", err)
	}
	if files == nil {
		t.Error("expected non-nil files for staged mode")
	}
}

// TestGetDiffFiles_BranchMode tests branch comparison
func TestGetDiffFiles_BranchMode(t *testing.T) {
	dir, cleanup := testRepo(t)
	defer cleanup()

	// Create a feature branch with changes
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@test.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@test.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v failed: %v\n%s", args, err, out)
		}
	}

	// Get current branch name (main or master)
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = dir
	out, _ := cmd.Output()
	baseBranch := strings.TrimSpace(string(out))

	// Create feature branch
	run("checkout", "-b", "feature")

	// Make a change
	newFile := filepath.Join(dir, "feature.txt")
	if err := os.WriteFile(newFile, []byte("feature content\n"), 0644); err != nil {
		t.Fatalf("failed to create feature file: %v", err)
	}
	run("add", "feature.txt")
	run("commit", "-m", "Add feature")

	repo, err := Open(dir)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}

	// Get diff against base branch
	files, err := repo.GetDiffFiles(baseBranch)
	if err != nil {
		t.Fatalf("GetDiffFiles failed: %v", err)
	}

	if len(files) != 1 {
		t.Errorf("expected 1 file, got %d", len(files))
	}
	if len(files) > 0 {
		if files[0].Path != "feature.txt" {
			t.Errorf("expected feature.txt, got %q", files[0].Path)
		}
		if files[0].Status != "added" {
			t.Errorf("expected added status, got %q", files[0].Status)
		}
	}
}

// TestParseDiffOutput tests parsing git diff output
func TestParseDiffOutput(t *testing.T) {
	diffOutput := `diff --git a/foo.go b/foo.go
index abc123..def456 100644
--- a/foo.go
+++ b/foo.go
@@ -1,3 +1,4 @@
 package main
+import "fmt"
 func main() {
+    fmt.Println("hi")
 }
diff --git a/bar.go b/bar.go
new file mode 100644
--- /dev/null
+++ b/bar.go
@@ -0,0 +1,3 @@
+package main
+
+func bar() {}
`

	files := parseDiffOutput(diffOutput)

	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d", len(files))
	}

	// First file: modified
	if files[0].Path != "foo.go" {
		t.Errorf("expected foo.go, got %q", files[0].Path)
	}
	if files[0].Status != "modified" {
		t.Errorf("expected modified, got %q", files[0].Status)
	}
	if files[0].Additions != 2 {
		t.Errorf("expected 2 additions, got %d", files[0].Additions)
	}

	// Second file: added
	if files[1].Path != "bar.go" {
		t.Errorf("expected bar.go, got %q", files[1].Path)
	}
	if files[1].Status != "added" {
		t.Errorf("expected added, got %q", files[1].Status)
	}
	if files[1].Additions != 3 {
		t.Errorf("expected 3 additions, got %d", files[1].Additions)
	}
}

// TestParseDiffOutput_Deleted tests parsing deleted file diff
func TestParseDiffOutput_Deleted(t *testing.T) {
	diffOutput := `diff --git a/deleted.go b/deleted.go
deleted file mode 100644
--- a/deleted.go
+++ /dev/null
@@ -1,5 +0,0 @@
-package main
-
-func deleted() {
-    // removed
-}
`

	files := parseDiffOutput(diffOutput)

	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}

	if files[0].Status != "deleted" {
		t.Errorf("expected deleted, got %q", files[0].Status)
	}
	if files[0].Deletions != 5 {
		t.Errorf("expected 5 deletions, got %d", files[0].Deletions)
	}
}

// TestParseDiffOutput_Empty tests parsing empty diff
func TestParseDiffOutput_Empty(t *testing.T) {
	files := parseDiffOutput("")
	if len(files) != 0 {
		t.Errorf("expected 0 files for empty diff, got %d", len(files))
	}
}
