FROM rust:1.89-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release --bins

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work

COPY --from=builder /app/target/release/tlsn-notary-server /usr/local/bin/tlsn-notary-server
COPY --from=builder /app/target/release/tlsn-prove /usr/local/bin/tlsn-prove
COPY --from=builder /app/target/release/tlsn-verify /usr/local/bin/tlsn-verify
COPY --from=builder /app/target/release/tlsn-api /usr/local/bin/tlsn-api

ENV RUST_LOG=info

CMD ["tlsn-notary-server"]
