use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use tlsn_docker_tools::verify_presentation_bytes;

#[derive(Debug, Parser)]
#[command(version, about = "Verify a TLSNotary presentation file")]
struct Args {
    #[arg(long)]
    presentation: PathBuf,

    #[arg(long)]
    json: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let bytes = std::fs::read(&args.presentation)?;
    let output = verify_presentation_bytes(&bytes)?;

    if args.json {
        println!("{}", serde_json::to_string(&output)?);
        return Ok(());
    }

    println!("Verified server: {}", output.server_name);
    println!("Verified time: {}", output.session_time);
    println!("Data sent:\n{}\n", output.sent_data);
    println!("Data received:\n{}\n", output.recv_data);

    Ok(())
}
