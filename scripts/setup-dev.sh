#!/usr/bin/env bash
#
# Smart Factory Supervisor — Development Environment Setup
#
# Checks prerequisites, installs dependencies, and builds core components.
# Run from the repository root.
#
# Usage:
#   bash scripts/setup-dev.sh
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "============================================"
echo "  Smart Factory Supervisor - Dev Setup"
echo "============================================"
echo ""

# ── Prerequisites check ─────────────────────────────────────────────────────

MISSING=()

command -v node  >/dev/null 2>&1 || MISSING+=("Node.js")
command -v docker >/dev/null 2>&1 || MISSING+=("Docker")
command -v uv    >/dev/null 2>&1 || MISSING+=("uv (pip install uv)")
command -v cmake >/dev/null 2>&1 || MISSING+=("CMake")

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "❌ Missing prerequisites: ${MISSING[*]}" >&2
    echo ""
    echo "Please install the missing tools and re-run this script." >&2
    exit 1
fi

echo "✅ All prerequisites found"

# ── Frontend setup ──────────────────────────────────────────────────────────

echo ""
echo "📦 Setting up frontend..."
cd src/ops-frontend

npm install
echo "✅ Frontend ready"

# ── Python services setup ───────────────────────────────────────────────────

echo ""
echo "🐍 Setting up Python services..."

for SVC in ops-api ai-service ai-agent; do
    echo "  Installing $SVC..."
    cd "$REPO_ROOT/src/$SVC"
    uv sync
    echo "  ✅ $SVC ready"
done

# ── Core platform build ─────────────────────────────────────────────────────

echo ""
echo "⚙️  Setting up core platform..."
cd "$REPO_ROOT/src/core-platform/cpp"

cmake -B build
cmake --build build
echo "✅ Core platform ready"

# ── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  🎉 Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  docker compose -f src/docker-compose.yaml up -d"
echo ""
cd "$REPO_ROOT"
