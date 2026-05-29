FROM ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV UV_SYSTEM_PYTHON=1
WORKDIR /app
COPY shared/ /app/shared
COPY ops-api/ /app/ops-api
RUN uv pip install --no-cache /app/shared && \
    uv pip install --no-cache -r /app/ops-api/requirements.txt
EXPOSE 8003
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health')"
WORKDIR /app/ops-api
CMD uvicorn app.main:app --host 0.0.0.0 --port 8003
