# Nero media sidecar - Rust WebRTC peer + Opus<->PCM bridge.
# Build context is ./media so the Rust build doesn't drag the whole repo in.
# Builder pinned to bookworm so its glibc matches the debian:bookworm-slim runtime
# (rust:1-slim tracks a newer Debian and links a glibc the runtime lacks).
FROM rust:1-bookworm AS builder
WORKDIR /build
# audiopus_sys links system libopus via pkg-config (else it tries to autogen it).
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libopus-dev \
    && rm -rf /var/lib/apt/lists/*
COPY . ./
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libopus0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/nero-media /usr/local/bin/nero-media

EXPOSE 7070/tcp
EXPOSE 7088/udp
CMD ["nero-media"]
