use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default)]
struct ViewedState {
    // repo_path -> branch -> commit -> set of viewed files
    repos: HashMap<String, HashMap<String, HashMap<String, Vec<String>>>>,
}

pub struct StateManager {
    state_file: PathBuf,
    state: ViewedState,
}

impl StateManager {
    pub fn new() -> Result<Self> {
        let state_dir = dirs::state_dir()
            .or_else(|| dirs::data_local_dir())
            .context("Failed to determine state directory")?
            .join("guck");

        fs::create_dir_all(&state_dir).context("Failed to create state directory")?;

        let state_file = state_dir.join("viewed.json");

        let state = if state_file.exists() {
            let contents = fs::read_to_string(&state_file)
                .context("Failed to read state file")?;
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            ViewedState::default()
        };

        Ok(Self { state_file, state })
    }

    pub fn is_file_viewed(
        &self,
        repo_path: &str,
        branch: &str,
        commit: &str,
        file_path: &str,
    ) -> Result<bool> {
        Ok(self
            .state
            .repos
            .get(repo_path)
            .and_then(|branches| branches.get(branch))
            .and_then(|commits| commits.get(commit))
            .map(|files| files.contains(&file_path.to_string()))
            .unwrap_or(false))
    }

    pub fn mark_file_viewed(
        &mut self,
        repo_path: &str,
        branch: &str,
        commit: &str,
        file_path: &str,
    ) -> Result<()> {
        let repo = self
            .state
            .repos
            .entry(repo_path.to_string())
            .or_insert_with(HashMap::new);

        let branch_map = repo
            .entry(branch.to_string())
            .or_insert_with(HashMap::new);

        let commit_files = branch_map
            .entry(commit.to_string())
            .or_insert_with(Vec::new);

        if !commit_files.contains(&file_path.to_string()) {
            commit_files.push(file_path.to_string());
        }

        self.save()?;
        Ok(())
    }

    fn save(&self) -> Result<()> {
        let contents = serde_json::to_string_pretty(&self.state)
            .context("Failed to serialize state")?;
        fs::write(&self.state_file, contents).context("Failed to write state file")?;
        Ok(())
    }
}
