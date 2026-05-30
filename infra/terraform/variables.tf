variable "environment" {
  description = "Deployment environment (dev, staging, production)"
  type        = string
  default     = "dev"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

# ── Port mappings ───────────────────────────────────────────────────────────

variable "redis_port" {
  description = "Host port for Redis"
  type        = number
  default     = 6379
}

variable "postgres_port" {
  description = "Host port for PostgreSQL"
  type        = number
  default     = 5432
}

variable "postgres_user" {
  description = "PostgreSQL username"
  type        = string
  default     = "showcase"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "showcase_secret"
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "showcase"
}

variable "core_platform_port" {
  description = "Host port for core platform simulation"
  type        = number
  default     = 8001
}

variable "ai_service_port" {
  description = "Host port for AI service"
  type        = number
  default     = 8002
}

variable "ops_api_port" {
  description = "Host port for Operations API"
  type        = number
  default     = 8003
}

variable "ai_agent_port" {
  description = "Host port for AI agent"
  type        = number
  default     = 8004
}

variable "frontend_port" {
  description = "Host port for frontend dashboard"
  type        = number
  default     = 3000
}
