FROM python:3.12-slim AS builder
WORKDIR /app
COPY ai-service/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY shared/ /app/shared
RUN pip install --no-cache-dir /app/shared
COPY ai-service/ /app/ai-service
ENV PATH=/root/.local/bin:$PATH
EXPOSE 8002
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8002/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
