output "api_url" {
  description = "Base URL for the Operations API"
  value       = "http://localhost:${var.ops_api_port}"
}

output "frontend_url" {
  description = "Base URL for the frontend dashboard"
  value       = "http://localhost:${var.frontend_port}"
}

output "ai_service_url" {
  description = "Base URL for the AI service"
  value       = "http://localhost:${var.ai_service_port}"
}

output "ai_agent_url" {
  description = "Base URL for the AI agent"
  value       = "http://localhost:${var.ai_agent_port}"
}

output "redis_connection" {
  description = "Redis connection string"
  value       = "redis://localhost:${var.redis_port}/0"
}

output "postgres_connection" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${var.postgres_user}:${var.postgres_password}@localhost:${var.postgres_port}/${var.postgres_db}"
  sensitive   = true
}
