FROM ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV UV_SYSTEM_PYTHON=1
WORKDIR /app
COPY ai-agent/ /app/ai-agent
RUN uv pip install --no-cache -r /app/ai-agent/requirements.txt
EXPOSE 8004
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/health')"
WORKDIR /app/ai-agent
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8004"]
