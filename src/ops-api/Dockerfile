FROM python:3.12-slim AS builder
WORKDIR /app
COPY ops-api/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY shared/ /app/shared
RUN pip install --no-cache-dir /app/shared
COPY ops-api/ /app/ops-api
ENV PATH=/root/.local/bin:$PATH
EXPOSE 8003
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
