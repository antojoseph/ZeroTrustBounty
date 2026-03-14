use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use tlsn_docker_tools::{
    artifact_stem, build_default_request, generate_proof_artifacts, persist_generated_artifacts,
    GenerateProofConfig, DEFAULT_MAX_RECV_DATA, DEFAULT_MAX_SENT_DATA, DEFAULT_NOTARY_ADDR,
};

#[derive(Debug, Parser)]
#[command(
    version,
    about = "Generate a TLSNotary presentation for an HTTPS endpoint"
)]
struct Args {
    #[arg(long, default_value = DEFAULT_NOTARY_ADDR)]
    notary_addr: String,

    #[arg(long, default_value = "example.com")]
    server_host: String,

    #[arg(long, default_value = "example.com")]
    server_name: String,

    #[arg(long, default_value_t = 443)]
    server_port: u16,

    #[arg(long, default_value = "/")]
    path: String,

    #[arg(long, default_value = "/artifacts")]
    output_dir: PathBuf,

    #[arg(long)]
    output_stem: Option<String>,

    #[arg(long, default_value_t = DEFAULT_MAX_SENT_DATA)]
    max_sent_data: usize,

    #[arg(long, default_value_t = DEFAULT_MAX_RECV_DATA)]
    max_recv_data: usize,

    #[arg(long)]
    ca_bundle: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let stem = args
        .output_stem
        .clone()
        .unwrap_or_else(|| artifact_stem(&args.server_name));
    let request_bytes = build_default_request(&args.server_name, &args.path);

    let artifacts = generate_proof_artifacts(GenerateProofConfig {
        notary_addr: args.notary_addr,
        server_host: args.server_host,
        server_name: args.server_name.clone(),
        server_port: args.server_port,
        request_bytes,
        output_stem: Some(stem.clone()),
        max_sent_data: args.max_sent_data,
        max_recv_data: args.max_recv_data,
        ca_bundle: args.ca_bundle,
        hide_request: false,
        redaction_rules: Vec::new(),
    })
    .await?;

    let paths = persist_generated_artifacts(&args.output_dir, &artifacts).await?;

    println!("Notarization completed successfully.");
    println!("Server: {}", artifacts.summary.server_name);
    println!("Attestation: {}", paths.attestation.display());
    println!("Secrets: {}", paths.secrets.display());
    println!("Presentation: {}", paths.presentation.display());

    Ok(())
}
