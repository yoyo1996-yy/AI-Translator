# Docker Deployment

This directory provides a portable Docker deployment for AI-Translator.

It runs the same Node.js web service used by the Function Compute build:

```text
Mobile / Web Client
        |
        v
Self-hosted Gateway
        |
        v
Provider Adapter
        |
        v
AI Provider
```

The container serves:

- `GET /` for the web app.
- `GET /health` and `GET /_health` for a generic local health check.
- `WS /realtime` for the realtime Gateway.

The generic health endpoints do not call any paid AI provider.

## Current Server Entry

```text
CURRENT_SERVER_ENTRY=server/cloud-server.ts
CURRENT_BUILD_COMMAND=npm run build && npm run build:fc-server
CURRENT_START_COMMAND=node server/cloud-server.js
CURRENT_PORT=9000
WEBSOCKET_PATH=/realtime
```

## Quick Start

From the repository root:

```bash
docker compose -f deploy/docker/docker-compose.yml up --build
```

Open:

```text
http://127.0.0.1:9000/
```

Health check:

```bash
curl http://127.0.0.1:9000/health
```

The default Docker configuration uses:

```env
TRANSLATION_PROVIDER=mock
```

This lets new users verify the container without paid AI API credentials and without consuming another person's resources.

## Production Provider

To use Bailian, create your own environment file from `env.example` and provide your own server-side credentials:

```env
TRANSLATION_PROVIDER=bailian
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

Never bake real secrets into the Docker image. Pass them at runtime through Docker Compose, your container platform, or another trusted secret manager.

This project does not provide a shared public paid Gateway. Each deployer is responsible for their own AI provider credentials, API usage, cloud resources, and costs.

## WebSocket Smoke Test

After the container starts with the mock provider, connect to:

```text
ws://127.0.0.1:9000/realtime
```

The Gateway should emit `proxy.status` and then become ready through the mock provider. This verifies HTTP Upgrade and the Gateway/provider pipeline without calling a paid AI API.

## Suitable Hosts

The Docker image can run on environments that support long-lived HTTP/WebSocket connections, such as:

- VPS hosts.
- Container hosting platforms.
- Cloud container services.

This directory intentionally avoids provider-specific hosting configuration.
