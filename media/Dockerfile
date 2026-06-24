# Nero media sidecar — Rust WebRTC peer + Opus<->PCM bridge.
# Build context is ./media so the Rust build doesn't drag the whole repo in.
FROM rust:1-slim AS builder
WORKDIR /build
# M1 (audiopus / libopus) adds: pkg-config libopus-dev cmake here.
COPY . ./
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# M1 adds the libopus0 runtime lib here.
COPY --from=builder /build/target/release/nero-media /usr/local/bin/nero-media

EXPOSE 7070/tcp
EXPOSE 7088/udp
CMD ["nero-media"]
