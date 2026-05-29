# Ops Frontend

React 19 + TypeScript dashboard for the Smart Factory Supervisor showcase.

## Features

- **KPI Dashboard** — real-time throughput, defect rate, uptime, robot count
- **Robot Fleet** — status cards for each robot with pose and task info
- **Digital Twin Map** — SVG factory floor layout with robot positions
- **Alert Board** — severity-coded alerts and live events
- **Command Console** — send commands to robots (via ops-api)
- **AI Chat Panel** — natural-language factory telemetry queries (via ai-agent)
- **Login Page** — JWT-authenticated session management
- **WebSocket Live Updates** — subscribes to ops-api broadcast channel

## Stack

- React 19, TypeScript 5.7, Vite 6
- SVG-based gauge cards and charts
- Dark theme industrial UI design
- Multi-stage Docker build (node → nginx)

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
docker build -t showcase/ops-frontend .
```
