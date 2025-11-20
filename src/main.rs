use anyhow::Result;
use clap::{Parser, Subcommand};

mod server;
mod state;
mod git;

#[derive(Parser)]
#[command(name = "guck")]
#[command(about = "A Git diff review tool with a web interface", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the web server to review diffs
    Start {
        /// Port to run the server on
        #[arg(short, long, default_value = "3000")]
        port: u16,

        /// Base branch to compare against
        #[arg(short, long, default_value = "main")]
        base: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "guck=info,tower_http=debug".into()),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Start { port, base } => {
            server::start(port, base).await?;
        }
    }

    Ok(())
}
