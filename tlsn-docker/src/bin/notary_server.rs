use std::path::PathBuf;

use anyhow::{anyhow, Result};
use clap::Parser;
use k256::ecdsa::SigningKey;
use tokio::net::{TcpListener, TcpStream};
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::{error, info};

use tlsn::{
    attestation::{
        request::Request as AttestationRequest, signing::Secp256k1Signer, Attestation,
        AttestationConfig, CryptoProvider,
    },
    config::{tls_commit::TlsCommitProtocolConfig, verifier::VerifierConfig},
    connection::{ConnectionInfo, TranscriptLength},
    transcript::{ContentType, TlsTranscript},
    verifier::VerifierOutput,
    Session,
};

use tlsn_docker_tools::{
    load_root_store, read_frame, write_frame, DEFAULT_MAX_RECV_DATA, DEFAULT_MAX_SENT_DATA,
    DEFAULT_NOTARY_BIND,
};

#[derive(Clone, Debug, Parser)]
#[command(version, about = "Run a TCP TLSNotary notary service")]
struct Args {
    #[arg(long, default_value = DEFAULT_NOTARY_BIND)]
    bind: String,

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
    let listener = TcpListener::bind(&args.bind).await?;
    info!("listening on {}", args.bind);

    loop {
        let (socket, peer) = listener.accept().await?;
        let args = args.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_connection(socket, args).await {
                error!("session from {peer}: {err:#}");
            } else {
                info!("completed session from {peer}");
            }
        });
    }
}

async fn handle_connection(socket: TcpStream, args: Args) -> Result<()> {
    let session = Session::new(socket.compat());
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let root_store = load_root_store(args.ca_bundle.as_deref())?;
    let verifier_config = VerifierConfig::builder().root_store(root_store).build()?;

    let verifier = handle.new_verifier(verifier_config)?.commit().await?;
    let (requested_sent, requested_recv) = {
        let request = verifier.request();
        let TlsCommitProtocolConfig::Mpc(config) = request.protocol() else {
            return Err(anyhow!("unsupported TLS commitment protocol"));
        };

        (config.max_sent_data(), config.max_recv_data())
    };

    if requested_sent > args.max_sent_data {
        verifier.reject(Some("max_sent_data is too large")).await?;
        return Err(anyhow!(
            "rejected session with max_sent_data={} (limit={})",
            requested_sent,
            args.max_sent_data
        ));
    }

    if requested_recv > args.max_recv_data {
        verifier.reject(Some("max_recv_data is too large")).await?;
        return Err(anyhow!(
            "rejected session with max_recv_data={} (limit={})",
            requested_recv,
            args.max_recv_data
        ));
    }

    let verifier = verifier.accept().await?.run().await?;
    let (
        VerifierOutput {
            transcript_commitments,
            ..
        },
        verifier,
    ) = verifier.verify().await?.accept().await?;

    let tls_transcript = verifier.tls_transcript().clone();
    verifier.close().await?;
    handle.close();

    let mut io = driver_task.await??;
    let request_bytes = read_frame(&mut io).await?;
    let request: AttestationRequest = bincode::deserialize(&request_bytes)?;
    let attestation = issue_attestation(request, transcript_commitments, &tls_transcript)?;
    let attestation_bytes = bincode::serialize(&attestation)?;
    write_frame(&mut io, &attestation_bytes).await?;

    Ok(())
}

fn issue_attestation(
    request: AttestationRequest,
    transcript_commitments: Vec<tlsn::transcript::TranscriptCommitment>,
    tls_transcript: &TlsTranscript,
) -> Result<Attestation> {
    let signing_key = SigningKey::from_bytes(&[1u8; 32].into())?;
    let signer = Box::new(Secp256k1Signer::new(&signing_key.to_bytes())?);

    let mut provider = CryptoProvider::default();
    provider.signer.set_signer(signer);

    let sent_len = tls_transcript
        .sent()
        .iter()
        .filter(|record| record.typ == ContentType::ApplicationData)
        .map(|record| record.ciphertext.len())
        .sum::<usize>();

    let recv_len = tls_transcript
        .recv()
        .iter()
        .filter(|record| record.typ == ContentType::ApplicationData)
        .map(|record| record.ciphertext.len())
        .sum::<usize>();

    let mut config_builder = AttestationConfig::builder();
    config_builder.supported_signature_algs(Vec::from_iter(provider.signer.supported_algs()));
    let config = config_builder.build()?;

    let mut builder = Attestation::builder(&config).accept_request(request)?;
    builder
        .connection_info(ConnectionInfo {
            time: tls_transcript.time(),
            version: *tls_transcript.version(),
            transcript_length: TranscriptLength {
                sent: sent_len as u32,
                received: recv_len as u32,
            },
        })
        .server_ephemeral_key(tls_transcript.server_ephemeral_key().clone())
        .transcript_commitments(transcript_commitments);

    builder.build(&provider).map_err(Into::into)
}
