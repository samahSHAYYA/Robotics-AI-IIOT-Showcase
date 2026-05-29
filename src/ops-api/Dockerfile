FROM ghcr.io/astral-sh/uv:0.5.29 AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY shared/ /app/shared
COPY ops-api/ /app/ops-api
RUN cd /app/ops-api && uv sync --no-dev
EXPOSE 8003
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health')"
WORKDIR /app/ops-api
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
