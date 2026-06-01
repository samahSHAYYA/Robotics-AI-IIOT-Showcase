FROM ghcr.io/astral-sh/uv:0.11.17 AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY ai-agent/ /app/ai-agent
RUN cd /app/ai-agent && uv sync --no-dev
EXPOSE 8004
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/health')"
WORKDIR /app/ai-agent
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8004"]
