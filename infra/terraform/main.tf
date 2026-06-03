# Smart Factory Supervisor — Terraform infrastructure definition
#
# This configuration uses the Kreuzwerker Docker provider to define
# the containerised services for local / single-host demo deployments.
#
# Usage:
#   terraform init
#   terraform plan -var="image_tag=latest"
#   terraform apply

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }

  backend "local" {}
}

provider "docker" {
  host = var.docker_host
}

# ── Networks ────────────────────────────────────────────────────────────────

resource "docker_network" "showcase_net" {
  name   = "showcase_net"
  driver = "bridge"
}

# ── Volumes ─────────────────────────────────────────────────────────────────

resource "docker_volume" "redis_data" {
  name = "redis_data"
}

resource "docker_volume" "postgres_data" {
  name = "postgres_data"
}

resource "docker_volume" "core_platform_data" {
  name = "core_platform_data"
}

resource "docker_volume" "core_platform_logs" {
  name = "core_platform_logs"
}

resource "docker_volume" "ai_service_models" {
  name = "ai_service_models"
}

resource "docker_volume" "ai_service_cache" {
  name = "ai_service_cache"
}

# ── Redis ───────────────────────────────────────────────────────────────────

resource "docker_container" "redis" {
  name    = "showcase-redis"
  image   = "redis:7-alpine"
  restart = "unless-stopped"

  ports {
    internal = 6379
    external = var.redis_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  volumes {
    volume_name    = docker_volume.redis_data.name
    container_path = "/data"
  }

  healthcheck {
    test     = ["CMD", "redis-cli", "ping"]
    interval = "5s"
    timeout  = "3s"
    retries  = 5
  }
}

# ── PostgreSQL ──────────────────────────────────────────────────────────────

resource "docker_container" "postgres" {
  name    = "showcase-postgres"
  image   = "postgres:16-alpine"
  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_DB=${var.postgres_db}",
  ]

  ports {
    internal = 5432
    external = var.postgres_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  volumes {
    volume_name    = docker_volume.postgres_data.name
    container_path = "/var/lib/postgresql/data"
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.postgres_user} -d ${var.postgres_db}"]
    interval = "5s"
    timeout  = "3s"
    retries  = 5
  }
}

# ── Core Platform (C++ simulation) ─────────────────────────────────────────

resource "docker_container" "core_platform" {
  name    = "core-platform"
  image   = "showcase-core-platform:${var.image_tag}"
  restart = "unless-stopped"

  env = [
    "ENVIRONMENT=${var.environment}",
  ]

  ports {
    internal = 8001
    external = var.core_platform_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  volumes {
    volume_name    = docker_volume.core_platform_data.name
    container_path = "/app/data"
  }

  volumes {
    volume_name    = docker_volume.core_platform_logs.name
    container_path = "/app/logs"
  }

  depends_on = [docker_container.redis]
}

# ── AI Service (ML inference) ───────────────────────────────────────────────

resource "docker_container" "ai_service" {
  name    = "ai-service"
  image   = "showcase-ai-service:${var.image_tag}"
  restart = "unless-stopped"

  env = [
    "ENVIRONMENT=${var.environment}",
    "REDIS_URL=redis://${docker_container.redis.name}:6379/0",
  ]

  ports {
    internal = 8002
    external = var.ai_service_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  volumes {
    volume_name    = docker_volume.ai_service_models.name
    container_path = "/app/models"
  }

  volumes {
    volume_name    = docker_volume.ai_service_cache.name
    container_path = "/app/cache"
  }

  depends_on = [docker_container.redis]
}

# ── Ops API (FastAPI backend) ───────────────────────────────────────────────

resource "docker_container" "ops_api" {
  name    = "ops-api"
  image   = "showcase-ops-api:${var.image_tag}"
  restart = "unless-stopped"

  env = [
    "ENVIRONMENT=${var.environment}",
    "REDIS_URL=redis://${docker_container.redis.name}:6379/0",
    "DATABASE_URL=postgresql+asyncpg://${var.postgres_user}:${var.postgres_password}@${docker_container.postgres.name}:5432/${var.postgres_db}",
    "SERVICE_PORT=${var.ops_api_port}",
  ]

  ports {
    internal = 8003
    external = var.ops_api_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  depends_on = [
    docker_container.redis,
    docker_container.postgres,
  ]
}

# ── AI Agent (PydanticAI + Ollama) ──────────────────────────────────────────

resource "docker_container" "ai_agent" {
  name    = "ai-agent"
  image   = "showcase-ai-agent:${var.image_tag}"
  restart = "unless-stopped"

  env = [
    "ENVIRONMENT=${var.environment}",
    "OLLAMA_URL=http://host.docker.internal:11434",
    "OPS_API_URL=http://${docker_container.ops_api.name}:8003",
    "LLM_MODEL=qwen3:14b",
  ]

  ports {
    internal = 8004
    external = var.ai_agent_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  depends_on = [docker_container.ops_api]
}

# ── Ops Frontend (React dashboard) ──────────────────────────────────────────

resource "docker_container" "ops_frontend" {
  name    = "ops-frontend"
  image   = "showcase-ops-frontend:${var.image_tag}"
  restart = "unless-stopped"

  ports {
    internal = 80
    external = var.frontend_port
  }

  networks_advanced {
    name = docker_network.showcase_net.name
  }

  depends_on = [docker_container.ops_api]
}
