# Deployment and Infrastructure Guidelines

## Purpose

Define how services are built, packaged, deployed, and orchestrated in this
project. Covers the local Docker Compose workflow that is the primary
deployment target.

## Build and package

### Dockerfile standards

Every service must have a `Dockerfile` at its root. The Dockerfile must:

- Use a specific version tag (never `latest` for base images).
- Pin system packages with explicit versions where available.
- Use multi-stage builds for compiled languages (C++) to keep runtime images
  small.
- Set `WORKDIR` to `/app`.
- Copy only what is needed at each stage.
- Run as non-root user where practical.

Current base images:

| Service | Base image | Rationale |
|---|---|---|
| `core-platform` | `ubuntu:24.04` | C++20 runtime, glibc 2.39 |
| `ai-service` | `python:3.12-slim` | ML inference, minimal surface |
| `ops-api` | `python:3.12-slim` | FastAPI, minimal surface |
| `ops-frontend` | `node:22-alpine` | React build + Nginx serve |

### Image tagging

- Local builds: `showcase/<service>:local`
- CI builds: `showcase/<service>:<git-sha>-<timestamp>`
- Releases: `showcase/<service>:<semver>`

Never deploy an untagged image.

## Environment configuration

### Layered env files

Environment is loaded in two layers:

```
src/.env                     ← shared defaults (checked in)
src/envs/<service>/.env      ← per-service overrides (checked in)
```

The global `.env` holds shared values (ports, log level, project name).
Per-service `.env` files hold service-specific values.

Secrets and machine-local overrides must go in a
`src/envs/<service>/.env.local` file (gitignored). Docker Compose reads these
in order: `.env` < `envs/<service>/.env` < `.env.local`.

### Required env vars per service

| Service | Required vars |
|---|---|
| `core-platform` | `SERVICE_NAME`, `SERVICE_PORT`, `ROS_DOMAIN_ID` |
| `ai-service` | `SERVICE_NAME`, `SERVICE_PORT`, `MODEL_NAME` |
| `ops-api` | `SERVICE_NAME`, `SERVICE_PORT`, `API_VERSION` |
| `ops-frontend` | `SERVICE_NAME`, `SERVICE_PORT`, `VITE_API_BASE_URL` |

Every service must validate its required env vars at startup and exit with
a clear diagnostic on missing ones (classify as `config` error per
`error-handling.md`).

## Networking

All services share one bridge network: `showcase_net`.

Service discovery uses container names as hostnames:

```
core-platform → http://core-platform:8001
ai-service    → http://ai-service:8002
ops-api       → http://ops-api:8003
ops-frontend  → http://ops-frontend:3000
```

Ports are exposed to the host only when external access is needed.
Internal-only services (pure stream consumers) expose no ports.

## Volumes

Named volumes for persistent or reference data:

| Volume | Mounted at | Owned by |
|---|---|---|
| `core_platform_data` | `/app/data` | `core-platform` |
| `core_platform_logs` | `/app/logs` | `core-platform` |
| `ai_service_models` | `/app/models` | `ai-service` |
| `ai_service_cache` | `/app/cache` | `ai-service` |

Runtime output (logs, snapshots) is written to volumes, never to
the container filesystem root.

## Startup order and health checks

### depends_on

`ops-frontend` depends on `ops-api`. All other services start independently.
For service-to-stream dependencies, each service's consumer retries with
backoff (per `error-handling.md` transient policy) until the stream is
available.

### Health checks

Every service should expose a `/health` endpoint (HTTP or the equivalent for
the protocol) that returns 200 when the service is ready. Docker Compose
health checks should be added when services become non-trivial:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

Services that depend on a stream from an upstream service must tolerate that
stream not existing yet (retry, don't crash).

## Resource limits

Set resource reservations and limits for every service:

```yaml
deploy:
  resources:
    reservations:
      cpus: "0.1"
      memory: "128M"
    limits:
      cpus: "0.5"
      memory: "512M"
```

GPU resources are reserved for `ai-service` only. Enable via compose profile
or explicit `gpus: all` annotation when deploying on a GPU-capable host.

## Logging in containers

All services must write structured JSON logs to stdout/stderr (per
`logging.md`). The container runtime captures these. Do not write to files
inside the container for operational logs.

Persistent event output (e.g. `events.jsonl`) is the exception — it goes to
the designated data/log volume.

## Local development vs production

| Aspect | Local (default profile) | Production |
|---|---|---|
| Build context | Local source | CI-built image |
| Env files | `.env` + `envs/*/.env` | `.env` + `envs/*/.env` + vault |
| Volumes | Named local volumes | Bind mounts or PVC |
| Ports | All exposed | Reverse proxy only |
| Debug | Enabled | Disabled |
| Resource limits | None (default) | Set per service |

## Security

- Never bake secrets into images. Use env files or a vault sidecar at
  runtime.
- Run containers with `--security-opt=no-new-privileges` and read-only root
  filesystem where practical.
- TLS is enforced between edge and backend (not between backend services on
  the internal network by default in local mode).
- Container images must be scanned for vulnerabilities before production
  deployment.

## Commands

```bash
# Build all services
docker compose -f src/docker-compose.yaml build

# Start all services
docker compose -f src/docker-compose.yaml up -d

# Start a single service
docker compose -f src/docker-compose.yaml up -d ops-api

# View logs
docker compose -f src/docker-compose.yaml logs -f

# Stop all services
docker compose -f src/docker-compose.yaml down

# Clean build (no cache)
docker compose -f src/docker-compose.yaml build --no-cache
```

## Living update rule

Update this document as the deployment model evolves (e.g. adding Kubernetes
manifests, cloud CI/CD, or a new service). Keep every rule actionable and
specific to the current infrastructure layer.
