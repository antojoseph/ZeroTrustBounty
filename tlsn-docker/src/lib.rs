use std::{
    fs::File,
    io::BufReader,
    ops::Range,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use futures::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tlsn::{
    attestation::{
        presentation::{Presentation, PresentationOutput},
        request::{Request as AttestationRequest, RequestConfig},
        Attestation, CryptoProvider, Secrets,
    },
    config::{
        prove::ProveConfig,
        prover::ProverConfig,
        tls::TlsClientConfig,
        tls_commit::{mpc::MpcTlsConfig, TlsCommitConfig},
    },
    connection::{HandshakeData, ServerName},
    prover::{state::Committed, Prover, ProverOutput},
    transcript::TranscriptCommitConfig,
    verifier::ServerCertVerifier,
    webpki::{CertificateDer, RootCertStore},
    Session,
};
use tokio::{
    fs,
    net::TcpStream,
    time::{timeout, Duration},
};
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::info;

pub const DEFAULT_NOTARY_BIND: &str = "0.0.0.0:7047";
pub const DEFAULT_NOTARY_ADDR: &str = "127.0.0.1:7047";
pub const DEFAULT_API_BIND: &str = "0.0.0.0:8090";
pub const DEFAULT_API_NOTARY_ADDR: &str = "notary:7047";
pub const DEFAULT_USER_AGENT: &str = "tlsn-docker-tools/0.1";
pub const DEFAULT_MAX_SENT_DATA: usize = 1 << 14;
pub const DEFAULT_MAX_RECV_DATA: usize = 1 << 18;
pub const DEFAULT_CA_BUNDLE: &str = "/etc/ssl/certs/ca-certificates.crt";
pub const DEFAULT_ARTIFACTS_DIR: &str = "/artifacts";
pub const DEFAULT_PROOF_TIMEOUT_SECS: u64 = 120;
pub const DEFAULT_HTTP_IO_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize)]
pub struct VerifiedPresentationSummary {
    pub attestation_fingerprint: String,
    pub server_name: String,
    pub session_time: String,
    pub sent_data: String,
    pub recv_data: String,
    pub sent_len: usize,
    pub recv_len: usize,
}

#[derive(Debug, Clone)]
pub struct GeneratedProofArtifacts {
    pub stem: String,
    pub attestation_bytes: Vec<u8>,
    pub secrets_bytes: Vec<u8>,
    pub presentation_bytes: Vec<u8>,
    pub full_presentation_bytes: Option<Vec<u8>>,
    pub summary: VerifiedPresentationSummary,
}

#[derive(Debug, Clone)]
pub struct GenerateProofConfig {
    pub notary_addr: String,
    pub server_host: String,
    pub server_name: String,
    pub server_port: u16,
    pub request_bytes: Vec<u8>,
    pub output_stem: Option<String>,
    pub max_sent_data: usize,
    pub max_recv_data: usize,
    pub ca_bundle: Option<PathBuf>,
    pub hide_request: bool,
    pub redaction_rules: Vec<RedactionRule>,
}

#[derive(Debug, Clone)]
pub struct PersistedArtifactPaths {
    pub attestation: PathBuf,
    pub secrets: PathBuf,
    pub presentation: PathBuf,
    pub full_presentation: Option<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct RedactionRule {
    pub kind: RedactionKind,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedactionKind {
    Header,
    Body,
    Substring,
    FullRequest,
}

#[derive(Debug)]
struct ParsedHttpRequest {
    method: String,
    target: String,
    version: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

#[derive(Debug)]
struct HeaderLineSpan {
    name: String,
    start: usize,
    end: usize,
}

pub async fn write_frame<T>(io: &mut T, payload: &[u8]) -> Result<()>
where
    T: AsyncWrite + Unpin,
{
    let len = u32::try_from(payload.len()).context("payload is too large")?;
    io.write_all(&len.to_be_bytes()).await?;
    io.write_all(payload).await?;
    io.flush().await?;
    Ok(())
}

pub async fn read_frame<T>(io: &mut T) -> Result<Vec<u8>>
where
    T: AsyncRead + Unpin,
{
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut payload = vec![0u8; len];
    io.read_exact(&mut payload).await?;
    Ok(payload)
}

pub fn make_transcript_commit_config(
    transcript: &tlsn::transcript::Transcript,
) -> Result<TranscriptCommitConfig> {
    let mut builder = TranscriptCommitConfig::builder(transcript);
    builder.commit_sent(&(0..transcript.sent().len()))?;
    builder.commit_recv(&(0..transcript.received().len()))?;
    builder.build().map_err(Into::into)
}

pub fn load_root_store(ca_bundle: Option<&Path>) -> Result<RootCertStore> {
    let path = ca_bundle
        .filter(|path| path.exists())
        .map(Path::to_path_buf)
        .or_else(|| {
            let path = PathBuf::from(DEFAULT_CA_BUNDLE);
            path.exists().then_some(path)
        });

    if let Some(path) = path {
        let file = File::open(&path)
            .with_context(|| format!("failed to open CA bundle at {}", path.display()))?;
        let mut reader = BufReader::new(file);
        let certs = rustls_pemfile::certs(&mut reader)
            .context("failed to parse CA bundle as PEM certificates")?;
        if certs.is_empty() {
            return Err(anyhow!(
                "CA bundle at {} did not contain any certificates",
                path.display()
            ));
        }

        return Ok(RootCertStore {
            roots: certs.into_iter().map(CertificateDer).collect(),
        });
    }

    Ok(RootCertStore::mozilla())
}

pub fn build_presentation(
    attestation: &Attestation,
    secrets: &Secrets,
    sent_reveal_ranges: &[Range<usize>],
    recv_reveal_ranges: &[Range<usize>],
) -> Result<Presentation> {
    let mut transcript_builder = secrets.transcript_proof_builder();

    for range in sent_reveal_ranges {
        transcript_builder.reveal_sent(&(range.start..range.end))?;
    }

    for range in recv_reveal_ranges {
        transcript_builder.reveal_recv(&(range.start..range.end))?;
    }

    let transcript_proof = transcript_builder.build()?;

    let provider = CryptoProvider::default();
    let mut builder = attestation.presentation_builder(&provider);
    builder
        .identity_proof(secrets.identity_proof())
        .transcript_proof(transcript_proof);

    builder.build().map_err(Into::into)
}

pub fn verify_presentation(
    presentation: Presentation,
) -> Result<tlsn::attestation::presentation::PresentationOutput> {
    verify_presentation_with_roots(presentation, &load_root_store(None)?)
}

pub fn verify_presentation_with_roots(
    presentation: Presentation,
    roots: &RootCertStore,
) -> Result<tlsn::attestation::presentation::PresentationOutput> {
    let provider = CryptoProvider {
        cert: ServerCertVerifier::new(roots)?,
        ..Default::default()
    };

    presentation.verify(&provider).map_err(Into::into)
}

pub fn verify_presentation_bytes(bytes: &[u8]) -> Result<VerifiedPresentationSummary> {
    verify_presentation_bytes_with_roots(bytes, &load_root_store(None)?)
}

pub fn verify_presentation_bytes_with_roots(
    bytes: &[u8],
    roots: &RootCertStore,
) -> Result<VerifiedPresentationSummary> {
    let presentation: Presentation = bincode::deserialize(bytes)?;
    let output = verify_presentation_with_roots(presentation, roots)?;
    summarize_presentation(output)
}

pub fn summarize_presentation(output: PresentationOutput) -> Result<VerifiedPresentationSummary> {
    let attestation_fingerprint = attestation_fingerprint(&output.attestation)?;
    let server_name = output
        .server_name
        .ok_or_else(|| anyhow!("presentation is missing a server name"))?;
    let mut transcript = output
        .transcript
        .ok_or_else(|| anyhow!("presentation is missing a transcript proof"))?;
    transcript.set_unauthed(b'X');

    let session_time = DateTime::<Utc>::from_timestamp(output.connection_info.time as i64, 0)
        .ok_or_else(|| anyhow!("presentation contained an invalid session timestamp"))?;

    Ok(VerifiedPresentationSummary {
        attestation_fingerprint,
        server_name: server_name.to_string(),
        session_time: session_time.to_rfc3339(),
        sent_data: String::from_utf8_lossy(transcript.sent_unsafe()).into_owned(),
        recv_data: String::from_utf8_lossy(transcript.received_unsafe()).into_owned(),
        sent_len: transcript.sent_unsafe().len(),
        recv_len: transcript.received_unsafe().len(),
    })
}

pub async fn generate_proof_artifacts(
    config: GenerateProofConfig,
) -> Result<GeneratedProofArtifacts> {
    let root_store = load_root_store(config.ca_bundle.as_deref())?;
    let normalized_request = normalize_http_request(&config.request_bytes, &config.server_name)?;
    let stem = config
        .output_stem
        .clone()
        .unwrap_or_else(|| artifact_stem(&config.server_name));

    let (attestation, secrets) =
        notarize_http_exchange(&config, &root_store, &normalized_request).await?;

    let sent_reveal_ranges = sent_reveal_ranges(
        &normalized_request,
        config.hide_request,
        &config.redaction_rules,
    )?;
    let recv_reveal_ranges = vec![0..secrets.transcript().received().len()];

    let presentation = build_presentation(
        &attestation,
        &secrets,
        &sent_reveal_ranges,
        &recv_reveal_ranges,
    )?;

    let attestation_bytes = bincode::serialize(&attestation)?;
    let secrets_bytes = bincode::serialize(&secrets)?;
    let presentation_bytes = bincode::serialize(&presentation)?;
    let summary = verify_presentation_bytes_with_roots(&presentation_bytes, &root_store)?;
    let full_presentation_bytes = if reveals_full_request(
        &sent_reveal_ranges,
        secrets.transcript().sent().len(),
    ) {
        None
    } else {
        let full_presentation = build_presentation(
            &attestation,
            &secrets,
            &[0..secrets.transcript().sent().len()],
            &recv_reveal_ranges,
        )?;

        Some(bincode::serialize(&full_presentation)?)
    };

    Ok(GeneratedProofArtifacts {
        stem,
        attestation_bytes,
        secrets_bytes,
        presentation_bytes,
        full_presentation_bytes,
        summary,
    })
}

pub async fn persist_generated_artifacts(
    output_dir: &Path,
    artifacts: &GeneratedProofArtifacts,
) -> Result<PersistedArtifactPaths> {
    fs::create_dir_all(output_dir).await?;

    let attestation = artifact_path(output_dir, &artifacts.stem, "attestation");
    let secrets = artifact_path(output_dir, &artifacts.stem, "secrets");
    let presentation = artifact_path(output_dir, &artifacts.stem, "presentation");
    let full_presentation = artifacts
        .full_presentation_bytes
        .as_ref()
        .map(|_| artifact_path(output_dir, &artifacts.stem, "full.presentation"));

    fs::write(&attestation, &artifacts.attestation_bytes).await?;
    fs::write(&secrets, &artifacts.secrets_bytes).await?;
    fs::write(&presentation, &artifacts.presentation_bytes).await?;
    if let (Some(path), Some(bytes)) = (&full_presentation, &artifacts.full_presentation_bytes) {
        fs::write(path, bytes).await?;
    }

    Ok(PersistedArtifactPaths {
        attestation,
        secrets,
        presentation,
        full_presentation,
    })
}

pub fn artifact_stem(server_name: &str) -> String {
    server_name
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

pub fn artifact_file_name(stem: &str, kind: &str) -> String {
    format!("{stem}.{kind}.tlsn")
}

pub fn artifact_path(output_dir: &Path, stem: &str, kind: &str) -> PathBuf {
    output_dir.join(artifact_file_name(stem, kind))
}

pub fn normalize_server_name(server_name: &str) -> String {
    if let Some(stripped) = server_name.strip_prefix('[') {
        if let Some(end_idx) = stripped.find(']') {
            return stripped[..end_idx].to_string();
        }
    }

    if let Some((host, port)) = server_name.rsplit_once(':') {
        if !host.contains(':') && port.chars().all(|ch| ch.is_ascii_digit()) {
            return host.to_string();
        }
    }

    server_name.to_string()
}

pub fn build_default_request(server_name: &str, path: &str) -> Vec<u8> {
    format!(
        "GET {path} HTTP/1.1\r\nHost: {server_name}\r\nAccept: */*\r\nAccept-Encoding: identity\r\nConnection: close\r\nUser-Agent: {DEFAULT_USER_AGENT}\r\n\r\n"
    )
    .into_bytes()
}

async fn notarize_http_exchange(
    config: &GenerateProofConfig,
    root_store: &RootCertStore,
    request_bytes: &[u8],
) -> Result<(Attestation, Secrets)> {
    let socket = TcpStream::connect(&config.notary_addr)
        .await
        .with_context(|| format!("failed to connect to notary at {}", config.notary_addr))?;

    let session = Session::new(socket.compat());
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let prover = handle
        .new_prover(ProverConfig::builder().build()?)?
        .commit(
            TlsCommitConfig::builder()
                .protocol(
                    MpcTlsConfig::builder()
                        .max_sent_data(config.max_sent_data)
                        .max_recv_data(config.max_recv_data)
                        .build()?,
                )
                .build()?,
        )
        .await?;

    let server_socket = TcpStream::connect((&*config.server_host, config.server_port))
        .await
        .with_context(|| {
            format!(
                "failed to connect to target {}:{}",
                config.server_host, config.server_port
            )
        })?;

    let (tls_connection, prover_fut) = prover
        .connect(
            TlsClientConfig::builder()
                .server_name(ServerName::Dns(config.server_name.clone().try_into()?))
                .root_store(root_store.clone())
                .build()?,
            server_socket.compat(),
        )
        .await?;

    info!(
        "requesting https://{}:{} via {} bytes",
        config.server_name,
        config.server_port,
        request_bytes.len()
    );

    let mut tls_connection = tls_connection;
    let prover_task = tokio::spawn(prover_fut);

    tls_connection.write_all(request_bytes).await?;
    tls_connection.flush().await?;

    let mut response_bytes = Vec::new();
    timeout(
        Duration::from_secs(DEFAULT_HTTP_IO_TIMEOUT_SECS),
        tls_connection.read_to_end(&mut response_bytes),
    )
    .await
    .context("timed out while waiting for the target server response")??;

    info!("received {} bytes from target", response_bytes.len());

    drop(tls_connection);

    let prover = prover_task.await??;
    let (attestation, secrets) =
        notarize(prover, config.server_name.clone(), driver_task, &handle).await?;
    handle.close();

    Ok((attestation, secrets))
}

async fn notarize(
    mut prover: Prover<Committed>,
    server_name: String,
    driver_task: tokio::task::JoinHandle<
        Result<tokio_util::compat::Compat<TcpStream>, tlsn::Error>,
    >,
    handle: &tlsn::SessionHandle,
) -> Result<(Attestation, Secrets)> {
    let transcript_commit = make_transcript_commit_config(prover.transcript())?;

    let mut request_config_builder = RequestConfig::builder();
    request_config_builder.transcript_commit(transcript_commit);
    let request_config = request_config_builder.build()?;

    let mut prove_builder = ProveConfig::builder(prover.transcript());
    if let Some(config) = request_config.transcript_commit() {
        prove_builder.transcript_commit(config.clone());
    }

    let disclosure_config = prove_builder.build()?;

    let ProverOutput {
        transcript_commitments,
        transcript_secrets,
        ..
    } = prover.prove(&disclosure_config).await?;

    let transcript = prover.transcript().clone();
    let tls_transcript = prover.tls_transcript().clone();
    prover.close().await?;

    let mut builder = AttestationRequest::builder(&request_config);
    builder
        .server_name(ServerName::Dns(server_name.clone().try_into()?))
        .handshake_data(HandshakeData {
            certs: tls_transcript
                .server_cert_chain()
                .context("server certificate chain missing")?
                .to_vec(),
            sig: tls_transcript
                .server_signature()
                .context("server signature missing")?
                .clone(),
            binding: tls_transcript.certificate_binding().clone(),
        })
        .transcript(transcript)
        .transcript_commitments(transcript_secrets, transcript_commitments);

    let provider = CryptoProvider::default();
    let (request, secrets) = builder.build(&provider)?;

    handle.close();
    let mut io = driver_task.await??;
    let request_bytes = bincode::serialize(&request)?;
    write_frame(&mut io, &request_bytes).await?;
    let attestation_bytes = read_frame(&mut io).await?;
    let attestation: Attestation = bincode::deserialize(&attestation_bytes)?;

    request.validate(&attestation, &provider)?;

    Ok((attestation, secrets))
}

fn normalize_http_request(raw_request: &[u8], server_name: &str) -> Result<Vec<u8>> {
    let parsed = parse_http_request(raw_request)?;

    let mut headers = parsed.headers;
    let mut has_host = false;
    let mut has_connection = false;
    let mut has_accept_encoding = false;

    for (name, value) in &mut headers {
        if name.eq_ignore_ascii_case("host") {
            has_host = true;
            if value.trim().is_empty() {
                *value = server_name.to_string();
            }
        } else if name.eq_ignore_ascii_case("connection") {
            has_connection = true;
            *value = "close".to_string();
        } else if name.eq_ignore_ascii_case("accept-encoding") {
            has_accept_encoding = true;
            *value = "identity".to_string();
        }
    }

    if !has_host {
        headers.push(("Host".to_string(), server_name.to_string()));
    }

    if !has_accept_encoding {
        headers.push(("Accept-Encoding".to_string(), "identity".to_string()));
    }

    if !has_connection {
        headers.push(("Connection".to_string(), "close".to_string()));
    }

    let mut normalized =
        format!("{} {} {}\r\n", parsed.method, parsed.target, parsed.version).into_bytes();

    for (name, value) in headers {
        normalized.extend_from_slice(name.as_bytes());
        normalized.extend_from_slice(b": ");
        normalized.extend_from_slice(value.as_bytes());
        normalized.extend_from_slice(b"\r\n");
    }

    normalized.extend_from_slice(b"\r\n");
    normalized.extend_from_slice(&parsed.body);

    Ok(normalized)
}

fn parse_http_request(raw_request: &[u8]) -> Result<ParsedHttpRequest> {
    if raw_request.is_empty() {
        return Err(anyhow!("request_b64 decoded to an empty HTTP request"));
    }

    let header_end = find_header_end(raw_request).unwrap_or(raw_request.len());
    let head = String::from_utf8_lossy(&raw_request[..header_end]);
    let body = raw_request[header_end..].to_vec();

    let mut lines = head.lines();
    let request_line = lines
        .next()
        .map(str::trim_end)
        .ok_or_else(|| anyhow!("missing HTTP request line"))?;
    let mut parts = request_line.splitn(3, ' ');
    let method = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| anyhow!("missing HTTP method"))?;
    let target = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| anyhow!("missing HTTP request target"))?;
    let version = parts
        .next()
        .filter(|part| !part.is_empty())
        .ok_or_else(|| anyhow!("missing HTTP version"))?;

    let mut headers = Vec::new();
    for line in lines {
        let trimmed = line.trim_end_matches('\r');
        if trimmed.is_empty() {
            continue;
        }

        let (name, value) = trimmed
            .split_once(':')
            .ok_or_else(|| anyhow!("invalid HTTP header line: {trimmed}"))?;
        headers.push((name.trim().to_string(), value.trim().to_string()));
    }

    Ok(ParsedHttpRequest {
        method: method.to_string(),
        target: target.to_string(),
        version: version.to_string(),
        headers,
        body,
    })
}

fn sent_reveal_ranges(
    request_bytes: &[u8],
    hide_request: bool,
    redaction_rules: &[RedactionRule],
) -> Result<Vec<Range<usize>>> {
    if request_bytes.is_empty() {
        return Ok(Vec::new());
    }

    if hide_request
        || redaction_rules
            .iter()
            .any(|rule| rule.kind == RedactionKind::FullRequest)
    {
        return Ok(Vec::new());
    }

    let mut hidden_ranges = Vec::new();
    let header_lines = header_line_spans(request_bytes);

    for rule in redaction_rules {
        match rule.kind {
            RedactionKind::Header => {
                if let Some(value) = rule.value.as_deref() {
                    for header in &header_lines {
                        if header.name.eq_ignore_ascii_case(value) {
                            hidden_ranges.push(header.start..header.end);
                        }
                    }
                }
            }
            RedactionKind::Body => {
                if let Some(range) = body_span(request_bytes) {
                    hidden_ranges.push(range);
                }
            }
            RedactionKind::Substring => {
                if let Some(value) = rule.value.as_deref() {
                    hidden_ranges.extend(find_substring_ranges(request_bytes, value.as_bytes()));
                }
            }
            RedactionKind::FullRequest => return Ok(Vec::new()),
        }
    }

    if hidden_ranges.is_empty() {
        return Ok(vec![0..request_bytes.len()]);
    }

    let merged = merge_ranges(hidden_ranges, request_bytes.len());
    Ok(invert_ranges(&merged, request_bytes.len()))
}

fn header_line_spans(request_bytes: &[u8]) -> Vec<HeaderLineSpan> {
    let header_end = find_header_end(request_bytes).unwrap_or(request_bytes.len());
    let header_bytes = &request_bytes[..header_end];

    let mut spans = Vec::new();
    let mut line_start = 0usize;
    let mut saw_request_line = false;

    while line_start < header_bytes.len() {
        let rel_end = header_bytes[line_start..]
            .iter()
            .position(|&byte| byte == b'\n')
            .map(|idx| idx + line_start)
            .unwrap_or(header_bytes.len());

        let line_end = if rel_end < header_bytes.len() {
            rel_end + 1
        } else {
            header_bytes.len()
        };
        let line = &header_bytes[line_start..rel_end];
        let trimmed = trim_cr(line);

        if !saw_request_line {
            saw_request_line = true;
        } else if !trimmed.is_empty() {
            if let Some(colon_idx) = trimmed.iter().position(|&byte| byte == b':') {
                spans.push(HeaderLineSpan {
                    name: String::from_utf8_lossy(&trimmed[..colon_idx]).into_owned(),
                    start: line_start,
                    end: line_end,
                });
            }
        }

        line_start = line_end;
    }

    spans
}

fn body_span(request_bytes: &[u8]) -> Option<Range<usize>> {
    let body_start = find_header_end(request_bytes)?;
    (body_start < request_bytes.len()).then_some(body_start..request_bytes.len())
}

fn find_substring_ranges(haystack: &[u8], needle: &[u8]) -> Vec<Range<usize>> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return Vec::new();
    }

    let mut ranges = Vec::new();
    let mut start = 0usize;
    while start + needle.len() <= haystack.len() {
        if haystack[start..].starts_with(needle) {
            ranges.push(start..start + needle.len());
            start += needle.len();
        } else {
            start += 1;
        }
    }

    ranges
}

fn merge_ranges(mut ranges: Vec<Range<usize>>, max_len: usize) -> Vec<Range<usize>> {
    ranges.retain(|range| range.start < range.end && range.start < max_len);
    for range in &mut ranges {
        range.end = range.end.min(max_len);
    }

    ranges.sort_by_key(|range| range.start);
    let mut merged: Vec<Range<usize>> = Vec::new();

    for range in ranges {
        if let Some(last) = merged.last_mut() {
            if range.start <= last.end {
                last.end = last.end.max(range.end);
                continue;
            }
        }

        merged.push(range);
    }

    merged
}

fn invert_ranges(hidden_ranges: &[Range<usize>], max_len: usize) -> Vec<Range<usize>> {
    let mut revealed = Vec::new();
    let mut cursor = 0usize;

    for range in hidden_ranges {
        if cursor < range.start {
            revealed.push(cursor..range.start);
        }
        cursor = range.end.max(cursor);
    }

    if cursor < max_len {
        revealed.push(cursor..max_len);
    }

    revealed
}

fn reveals_full_request(ranges: &[Range<usize>], request_len: usize) -> bool {
    ranges.len() == 1 && ranges[0].start == 0 && ranges[0].end == request_len
}

fn attestation_fingerprint(attestation: &Attestation) -> Result<String> {
    let bytes = bincode::serialize(attestation)?;
    let digest = Sha256::digest(bytes);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    if let Some(idx) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
        return Some(idx + 4);
    }

    bytes
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|idx| idx + 2)
}

fn trim_cr(bytes: &[u8]) -> &[u8] {
    bytes.strip_suffix(b"\r").unwrap_or(bytes)
}
