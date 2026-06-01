FROM ghcr.io/astral-sh/uv:0.11.17 AS uv

FROM python:3.12-slim AS builder
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY cpp/ /app/cpp/
RUN cmake -S /app/cpp -B /app/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /app/build --parallel "$(nproc)"

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN uv pip install --system --no-cache redis
WORKDIR /app
COPY --from=builder /app/build/core_platform_sim .
COPY scripts/ scripts/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD grep -q publish_to_redis /proc/*/cmdline 2>/dev/null || exit 1
CMD ["./entrypoint.sh"]
