FROM ghcr.io/astral-sh/uv:0.5.29 AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/
ENV UV_SYSTEM_PYTHON=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY shared/ /app/shared
COPY ai-service/ /app/ai-service
RUN uv pip install --no-cache /app/shared && \
    uv pip install --no-cache -r /app/ai-service/requirements.txt
EXPOSE 8002
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')"
WORKDIR /app/ai-service
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
