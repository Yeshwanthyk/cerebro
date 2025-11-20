use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use crate::git::GitRepo;
use crate::state::StateManager;

#[derive(Clone)]
struct AppState {
    git_repo: Arc<GitRepo>,
    state_manager: Arc<StateManager>,
}

#[derive(Serialize)]
struct DiffResponse {
    files: Vec<FileDiff>,
    branch: String,
    commit: String,
    repo_path: String,
}

#[derive(Serialize)]
struct FileDiff {
    path: String,
    status: String,
    additions: usize,
    deletions: usize,
    patch: String,
    viewed: bool,
}

#[derive(Deserialize)]
struct MarkViewedRequest {
    file_path: String,
}

pub async fn start(port: u16, base_branch: String) -> Result<()> {
    let git_repo = Arc::new(GitRepo::open(".")?);
    let state_manager = Arc::new(StateManager::new()?);

    let app_state = AppState {
        git_repo,
        state_manager,
    };

    // Build the router
    let app = Router::new()
        .route("/", get(index_handler))
        .route("/api/diff", get(diff_handler))
        .route("/api/mark-viewed", post(mark_viewed_handler))
        .route("/api/status", get(status_handler))
        .with_state(app_state)
        .layer(TraceLayer::new_for_http());

    let addr = format!("127.0.0.1:{}", port);
    tracing::info!("Starting server on http://{}", addr);
    tracing::info!("Comparing against base branch: {}", base_branch);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn index_handler() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

async fn diff_handler(State(state): State<AppState>) -> Result<Json<DiffResponse>, AppError> {
    let current_branch = state.git_repo.current_branch()?;
    let current_commit = state.git_repo.current_commit()?;
    let repo_path = state.git_repo.repo_path()?;

    let files = state.git_repo.get_diff_files("main")?;

    let mut file_diffs = Vec::new();
    for file in files {
        let viewed = state
            .state_manager
            .is_file_viewed(&repo_path, &current_branch, &current_commit, &file.path)?;

        file_diffs.push(FileDiff {
            path: file.path,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch,
            viewed,
        });
    }

    Ok(Json(DiffResponse {
        files: file_diffs,
        branch: current_branch,
        commit: current_commit,
        repo_path,
    }))
}

async fn mark_viewed_handler(
    State(state): State<AppState>,
    Json(payload): Json<MarkViewedRequest>,
) -> Result<StatusCode, AppError> {
    let current_branch = state.git_repo.current_branch()?;
    let current_commit = state.git_repo.current_commit()?;
    let repo_path = state.git_repo.repo_path()?;

    state.state_manager.mark_file_viewed(
        &repo_path,
        &current_branch,
        &current_commit,
        &payload.file_path,
    )?;

    Ok(StatusCode::OK)
}

#[derive(Serialize)]
struct StatusResponse {
    repo_path: String,
    branch: String,
    commit: String,
}

async fn status_handler(State(state): State<AppState>) -> Result<Json<StatusResponse>, AppError> {
    Ok(Json(StatusResponse {
        repo_path: state.git_repo.repo_path()?,
        branch: state.git_repo.current_branch()?,
        commit: state.git_repo.current_commit()?,
    }))
}

// Error handling
struct AppError(anyhow::Error);

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error: {}", self.0),
        )
            .into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
    }
}
