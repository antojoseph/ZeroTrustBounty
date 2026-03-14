use std::{net::SocketAddr, path::PathBuf};

use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use clap::Parser;
use serde::{Deserialize, Serialize};
use tokio::{
    net::TcpListener,
    time::{timeout, Duration},
};
use tracing::info;

use tlsn_docker_tools::{
    artifact_file_name, generate_proof_artifacts, normalize_server_name,
    persist_generated_artifacts, verify_presentation_bytes, GenerateProofConfig, RedactionKind,
    RedactionRule, DEFAULT_API_BIND, DEFAULT_API_NOTARY_ADDR, DEFAULT_ARTIFACTS_DIR,
    DEFAULT_MAX_RECV_DATA, DEFAULT_MAX_SENT_DATA, DEFAULT_PROOF_TIMEOUT_SECS,
};

#[derive(Debug, Parser)]
#[command(
    version,
    about = "Expose TLSNotary proof generation and verification over HTTP"
)]
struct Args {
    #[arg(long, default_value = DEFAULT_API_BIND)]
    bind: String,

    #[arg(long, default_value = DEFAULT_API_NOTARY_ADDR)]
    notary_addr: String,

    #[arg(long, default_value = DEFAULT_ARTIFACTS_DIR)]
    artifacts_dir: PathBuf,

    #[arg(long)]
    ca_bundle: Option<PathBuf>,

    #[arg(long, default_value_t = DEFAULT_MAX_SENT_DATA)]
    max_sent_data: usize,

    #[arg(long, default_value_t = DEFAULT_MAX_RECV_DATA)]
    max_recv_data: usize,
}

#[derive(Clone)]
struct AppState {
    notary_addr: String,
    artifacts_dir: PathBuf,
    ca_bundle: Option<PathBuf>,
    max_sent_data: usize,
    max_recv_data: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    notary_addr: String,
}

#[derive(Debug, Deserialize)]
struct VerifyRequest {
    presentation_b64: String,
    #[serde(default)]
    file_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct VerifyResponse {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    server_name: String,
    session_time: String,
    sent_data: String,
    recv_data: String,
    sent_len: usize,
    recv_len: usize,
}

#[derive(Debug, Deserialize)]
struct ProveRequest {
    #[serde(default)]
    notary_addr: Option<String>,
    #[serde(default)]
    notary_host: Option<String>,
    #[serde(default)]
    notary_port: Option<u16>,
    #[serde(alias = "target_host")]
    server_host: String,
    #[serde(default)]
    server_name: Option<String>,
    #[serde(default, alias = "target_port")]
    server_port: Option<u16>,
    request_b64: String,
    #[serde(default)]
    output_stem: Option<String>,
    #[serde(default)]
    persist: Option<bool>,
    #[serde(default, alias = "ca_cert_path")]
    ca_bundle_path: Option<String>,
    #[serde(default)]
    max_sent_data: Option<usize>,
    #[serde(default)]
    max_recv_data: Option<usize>,
    #[serde(default)]
    hide_request: Option<bool>,
    #[serde(default)]
    timeout_seconds: Option<u64>,
    #[serde(default)]
    redaction_rules: Vec<RedactionRulePayload>,
    #[serde(default)]
    _response_b64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RedactionRulePayload {
    #[serde(rename = "type")]
    kind: RedactionRuleKindPayload,
    #[serde(default)]
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum RedactionRuleKindPayload {
    Header,
    Body,
    Substring,
    FullRequest,
}

#[derive(Debug, Serialize)]
struct ProveResponse {
    status: &'static str,
    server_name: String,
    session_time: String,
    sent_data: String,
    recv_data: String,
    sent_len: usize,
    recv_len: usize,
    presentation_file_name: String,
    presentation_b64: String,
    attestation_file_name: String,
    attestation_b64: String,
    secrets_file_name: String,
    secrets_b64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    persisted_presentation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    persisted_attestation_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    persisted_secrets_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    details: String,
}

struct ApiError {
    status: StatusCode,
    error: String,
    details: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let state = AppState {
        notary_addr: args.notary_addr,
        artifacts_dir: args.artifacts_dir,
        ca_bundle: args.ca_bundle,
        max_sent_data: args.max_sent_data,
        max_recv_data: args.max_recv_data,
    };

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/prove", post(prove_handler))
        .route("/generate-proof", post(prove_handler))
        .route("/verify", post(verify_handler))
        .with_state(state);

    let listener = TcpListener::bind(&args.bind).await?;
    let addr = listener.local_addr().unwrap_or_else(|_| {
        args.bind
            .parse::<SocketAddr>()
            .unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], 8080)))
    });
    info!("tlsn-api listening on {}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "tlsn-api",
        notary_addr: state.notary_addr,
    })
}

async fn verify_handler(
    Json(request): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let bytes = decode_base64_field(&request.presentation_b64, "presentation_b64")?;
    if bytes.is_empty() {
        return Err(ApiError::bad_request(
            "Invalid proof payload",
            "presentation_b64 decoded to an empty TLSNotary presentation".to_string(),
        ));
    }

    let summary = verify_presentation_bytes(&bytes).map_err(|error| {
        ApiError::bad_request("Invalid TLSNotary presentation", error.to_string())
    })?;

    Ok(Json(VerifyResponse {
        status: "verified",
        file_name: request.file_name,
        server_name: summary.server_name,
        session_time: summary.session_time,
        sent_data: summary.sent_data,
        recv_data: summary.recv_data,
        sent_len: summary.sent_len,
        recv_len: summary.recv_len,
    }))
}

async fn prove_handler(
    State(state): State<AppState>,
    Json(request): Json<ProveRequest>,
) -> Result<Json<ProveResponse>, ApiError> {
    let request_bytes = decode_base64_field(&request.request_b64, "request_b64")?;
    if request_bytes.is_empty() {
        return Err(ApiError::bad_request(
            "Invalid request payload",
            "request_b64 decoded to an empty HTTP request".to_string(),
        ));
    }

    let connect_host = normalize_server_name(request.server_host.trim());
    if connect_host.is_empty() {
        return Err(ApiError::bad_request(
            "Invalid target host",
            "server_host was empty after normalization".to_string(),
        ));
    }

    let server_name = request
        .server_name
        .as_deref()
        .map(normalize_server_name)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| connect_host.clone());

    let redaction_rules = request
        .redaction_rules
        .into_iter()
        .map(|rule| RedactionRule {
            kind: match rule.kind {
                RedactionRuleKindPayload::Header => RedactionKind::Header,
                RedactionRuleKindPayload::Body => RedactionKind::Body,
                RedactionRuleKindPayload::Substring => RedactionKind::Substring,
                RedactionRuleKindPayload::FullRequest => RedactionKind::FullRequest,
            },
            value: rule.value,
        })
        .collect::<Vec<_>>();

    let config = GenerateProofConfig {
        notary_addr: request
            .notary_addr
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                match (
                    request
                        .notary_host
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty()),
                    request.notary_port,
                ) {
                    (Some(host), Some(port)) => Some(format!("{host}:{port}")),
                    _ => None,
                }
            })
            .unwrap_or_else(|| state.notary_addr.clone()),
        server_host: connect_host,
        server_name: server_name.clone(),
        server_port: request.server_port.unwrap_or(443),
        request_bytes,
        output_stem: request.output_stem.clone(),
        max_sent_data: request.max_sent_data.unwrap_or(state.max_sent_data),
        max_recv_data: request.max_recv_data.unwrap_or(state.max_recv_data),
        ca_bundle: request
            .ca_bundle_path
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| state.ca_bundle.clone()),
        hide_request: request.hide_request.unwrap_or(false),
        redaction_rules,
    };

    let proof_timeout = Duration::from_secs(
        request
            .timeout_seconds
            .unwrap_or(DEFAULT_PROOF_TIMEOUT_SECS),
    );

    let artifacts = timeout(proof_timeout, generate_proof_artifacts(config))
        .await
        .map_err(|_| {
            ApiError::gateway_timeout(
                "Proof generation timed out",
                format!(
                    "proof generation exceeded {} seconds",
                    proof_timeout.as_secs()
                ),
            )
        })?
        .map_err(|error| ApiError::bad_gateway("Proof generation failed", error.to_string()))?;

    let persisted = if request.persist.unwrap_or(false) {
        Some(
            persist_generated_artifacts(&state.artifacts_dir, &artifacts)
                .await
                .map_err(|error| {
                    ApiError::internal("Failed to persist proof artifacts", error.to_string())
                })?,
        )
    } else {
        None
    };

    Ok(Json(ProveResponse {
        status: "completed",
        server_name: artifacts.summary.server_name.clone(),
        session_time: artifacts.summary.session_time.clone(),
        sent_data: artifacts.summary.sent_data.clone(),
        recv_data: artifacts.summary.recv_data.clone(),
        sent_len: artifacts.summary.sent_len,
        recv_len: artifacts.summary.recv_len,
        presentation_file_name: artifact_file_name(&artifacts.stem, "presentation"),
        presentation_b64: STANDARD.encode(&artifacts.presentation_bytes),
        attestation_file_name: artifact_file_name(&artifacts.stem, "attestation"),
        attestation_b64: STANDARD.encode(&artifacts.attestation_bytes),
        secrets_file_name: artifact_file_name(&artifacts.stem, "secrets"),
        secrets_b64: STANDARD.encode(&artifacts.secrets_bytes),
        persisted_presentation_path: persisted
            .as_ref()
            .map(|paths| paths.presentation.display().to_string()),
        persisted_attestation_path: persisted
            .as_ref()
            .map(|paths| paths.attestation.display().to_string()),
        persisted_secrets_path: persisted
            .as_ref()
            .map(|paths| paths.secrets.display().to_string()),
    }))
}

fn decode_base64_field(value: &str, field_name: &str) -> Result<Vec<u8>, ApiError> {
    STANDARD.decode(value).map_err(|error| {
        ApiError::bad_request(format!("Invalid {}", field_name), error.to_string())
    })
}

impl ApiError {
    fn bad_request(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error: error.into(),
            details: details.into(),
        }
    }

    fn bad_gateway(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            error: error.into(),
            details: details.into(),
        }
    }

    fn gateway_timeout(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            status: StatusCode::GATEWAY_TIMEOUT,
            error: error.into(),
            details: details.into(),
        }
    }

    fn internal(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: error.into(),
            details: details.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(ErrorResponse {
            error: self.error,
            details: self.details,
        });

        (self.status, body).into_response()
    }
}
