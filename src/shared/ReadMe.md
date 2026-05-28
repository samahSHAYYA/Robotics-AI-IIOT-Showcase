# Shared Module

## Purpose

Shared contracts/schemas and small reusable utilities used across services.

## Scope

Shared contracts and schema definitions.
Shared Python utilities.
Shared C++ utilities.

## Rules

`shared` is not a standalone service.
Add code here only when at least two services genuinely need it.
Do not place service-specific business logic in shared.

## Structure

`src/shared/contracts/`
`src/shared/python/`
`src/shared/cpp/`
