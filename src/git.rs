use anyhow::{Context, Result};
use git2::{DiffOptions, Repository};

pub struct GitRepo {
    repo: Repository,
}

#[derive(Debug)]
pub struct FileInfo {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
}

impl GitRepo {
    pub fn open(path: &str) -> Result<Self> {
        let repo = Repository::discover(path).context("Failed to find git repository")?;
        Ok(Self { repo })
    }

    pub fn current_branch(&self) -> Result<String> {
        let head = self.repo.head().context("Failed to get HEAD")?;
        let branch_name = head
            .shorthand()
            .context("Failed to get branch name")?
            .to_string();
        Ok(branch_name)
    }

    pub fn current_commit(&self) -> Result<String> {
        let head = self.repo.head().context("Failed to get HEAD")?;
        let commit = head.peel_to_commit().context("Failed to get commit")?;
        Ok(commit.id().to_string())
    }

    pub fn repo_path(&self) -> Result<String> {
        let path = self
            .repo
            .path()
            .parent()
            .context("Failed to get repo path")?
            .to_str()
            .context("Invalid UTF-8 in path")?
            .to_string();
        Ok(path)
    }

    pub fn get_diff_files(&self, base_branch: &str) -> Result<Vec<FileInfo>> {
        // Get the base branch reference
        let base_ref = self
            .repo
            .find_branch(base_branch, git2::BranchType::Local)
            .with_context(|| format!("Failed to find branch: {}", base_branch))?;

        let base_commit = base_ref
            .get()
            .peel_to_commit()
            .context("Failed to get base commit")?;

        let base_tree = base_commit.tree().context("Failed to get base tree")?;

        // Get the current HEAD commit
        let head = self.repo.head().context("Failed to get HEAD")?;
        let head_commit = head.peel_to_commit().context("Failed to get HEAD commit")?;
        let head_tree = head_commit.tree().context("Failed to get HEAD tree")?;

        // Create diff
        let mut diff_opts = DiffOptions::new();
        diff_opts.include_untracked(false);

        let diff = self
            .repo
            .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
            .context("Failed to create diff")?;

        let mut files = Vec::new();

        // Process each delta in the diff
        diff.foreach(
            &mut |delta, _progress| {
                let file_path = delta
                    .new_file()
                    .path()
                    .unwrap_or_else(|| delta.old_file().path().unwrap())
                    .to_str()
                    .unwrap_or("")
                    .to_string();

                let status = match delta.status() {
                    git2::Delta::Added => "added",
                    git2::Delta::Deleted => "deleted",
                    git2::Delta::Modified => "modified",
                    git2::Delta::Renamed => "renamed",
                    git2::Delta::Copied => "copied",
                    _ => "unknown",
                }
                .to_string();

                files.push((file_path, status));
                true
            },
            None,
            None,
            None,
        )?;

        // Get detailed stats and patches for each file
        let mut result = Vec::new();
        for (file_path, status) in files {
            let stats = diff.stats().context("Failed to get diff stats")?;

            // Generate patch for this file
            let mut patch_str = String::new();
            diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
                use std::fmt::Write;
                let origin = line.origin();
                let content = std::str::from_utf8(line.content()).unwrap_or("");

                match origin {
                    '+' | '-' | ' ' => {
                        let _ = write!(patch_str, "{}{}", origin, content);
                    }
                    _ => {}
                }
                true
            })?;

            result.push(FileInfo {
                path: file_path,
                status,
                additions: stats.insertions(),
                deletions: stats.deletions(),
                patch: patch_str,
            });
        }

        Ok(result)
    }
}
