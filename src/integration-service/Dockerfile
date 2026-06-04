FROM ghcr.io/astral-sh/uv:0.11.17 AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY integration-service/ /app/integration-service
RUN cd /app/integration-service && uv sync --no-dev
EXPOSE 8006
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8006/health')"
WORKDIR /app/integration-service
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8006"]
