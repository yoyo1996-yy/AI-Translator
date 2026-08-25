# AI-Translator / AI 随身同传

[![License](https://img.shields.io/github/license/yoyo1996-yy/AI-Translator)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/yoyo1996-yy/AI-Translator)](https://github.com/yoyo1996-yy/AI-Translator/releases)
[![CI](https://github.com/yoyo1996-yy/AI-Translator/actions/workflows/ci.yml/badge.svg)](https://github.com/yoyo1996-yy/AI-Translator/actions/workflows/ci.yml)

An AI-powered multilingual real-time translation platform with web and Android client support.

AI-Translator is a self-hostable realtime AI translation framework with a web client, an Android client, and a server-side realtime Gateway.

It helps you build a private speech translation app where the frontend connects to your own Gateway, and the Gateway connects to an AI realtime model provider without exposing provider API keys to the browser or mobile app.

Current app focus:

- Conversation Mode: realtime speech from the selected source language to the selected target language.
- Push-To-Talk Mode: user speech from the selected source language to the selected target language.
- Personal self-hosted deployment for browser, PWA, and Android usage.

## Features

- AI-powered translation through a server-side realtime Gateway.
- Real-time speech recognition for conversation input.
- Text-to-speech playback for translated results.
- Web client built with Next.js.
- Installable PWA metadata and mobile-oriented layout.
- Android client built with Capacitor.
- Multilingual Conversation Mode for source-language listening and target-language playback.
- Push-to-talk translation mode for selected source-language input and target-language playback.
- Server-side Gateway for hiding provider API keys from clients.
- Pluggable realtime provider layer with Bailian and mock providers.
- Optional Gateway access token authentication with `APP_ACCESS_TOKEN`.
- Basic Gateway resource limits and in-memory rate limiting.
- Self-host deployment preparation for Alibaba Cloud Function Compute Custom Runtime ZIP packages.

## Supported Languages

Current validated languages:

- Chinese (`zh`)
- Japanese (`ja`)
- English (`en`)

The architecture is extensible to additional languages, but actual availability depends on the selected AI provider and its declared capabilities.

## Architecture

User-facing translation flow:

```text
User Speech
  |
  v
Speech Recognition
  |
  v
AI Translation Engine
  |
  v
Translated Text
  |
  v
Text-to-Speech Playback
```

Application architecture:

```text
Frontend / Android WebView / PWA
  |
  | Realtime WebSocket connection
  v
Server Layer
  |
  | Gateway protocol, auth, limits, session state
  v
Provider Layer
  |
  | Provider adapter
  v
AI Model Provider
```

The frontend connects to `/realtime` and never stores paid AI provider credentials.

The Gateway is responsible for:

- Client WebSocket lifecycle.
- Optional access control.
- Session duration and message size protection.
- Translation direction state.
- Mapping neutral Gateway operations to the selected provider adapter.

The Provider Layer is designed to be extensible. The current production provider is Bailian realtime. A mock provider is included for local tests. Other providers can be added by implementing the realtime provider interface described in [docs/provider-architecture.md](docs/provider-architecture.md).

Language availability is managed through a shared language capability registry. The web client, Gateway, and provider adapters use the same language definitions and provider capability declarations.

## Provider Support

The runtime supports pluggable AI providers.

Current providers:

- Bailian realtime provider.
- Mock provider.
- Secondary test provider for validating adapter extensibility.

Provider selection:

```env
TRANSLATION_PROVIDER=<provider>
```

Available values:

- `bailian`
- `mock`
- `test`

The default provider is `bailian`, so existing deployments keep the same behavior unless this variable is changed.

## Security Model

### API Key Safety

Users must provide their own AI provider credentials.

Do not put API keys in:

- Frontend code.
- Android assets.
- PWA files.
- Screenshots.
- Public documentation.
- Git history.

Provider credentials such as `DASHSCOPE_API_KEY` and `DASHSCOPE_WORKSPACE_ID` should only be configured as server-side environment variables.

### Gateway Trust Boundary

The Gateway should run in a trusted environment controlled by the deployer. Public Gateway URLs can consume paid AI API resources, so public or shared deployments should enable access control:

```env
APP_ACCESS_TOKEN=replace-with-a-long-random-token
```

When `APP_ACCESS_TOKEN` is empty, authentication is disabled for personal deployments. See [docs/security.md](docs/security.md) for the full security model and rate-limit settings.

## Quick Start

Requirements:

- Node.js 20 or newer.
- npm.
- AI provider credentials only when you switch from the mock provider to a real provider.

Clone and install:

```bash
git clone https://github.com/yoyo1996-yy/AI-Translator.git
cd AI-Translator
npm install
```

Create local environment configuration:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

For the first no-cost validation, keep:

```env
TRANSLATION_PROVIDER=mock
```

Run diagnostics:

```bash
npm run doctor
```

Run the free mock Gateway smoke test:

```bash
npm run test:gateway
```

Run the local development app:

```bash
npm run dev:all
```

Open:

```text
http://127.0.0.1:3000/
```

After the mock setup works, configure your own AI provider credentials:

```env
TRANSLATION_PROVIDER=bailian
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

Do not use the repository owner's Gateway or API credentials.

Local development uses:

- Web frontend: `http://127.0.0.1:3000/`
- Local realtime Gateway: `ws://127.0.0.1:3001`

Optional provider connection test:

```bash
npm run test:connection
```

This test must not print your real API key.

## Configuration

Start from [.env.example](.env.example).

Important variables:

```env
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
TRANSLATION_PROVIDER=mock
NEXT_PUBLIC_REALTIME_PROXY_URL=
REALTIME_PROXY_PATH=/realtime
APP_ACCESS_TOKEN=
```

Use `TRANSLATION_PROVIDER=mock` for first-time setup and smoke tests. Set `TRANSLATION_PROVIDER=bailian` only when configuring your own real provider credentials.

For local development, `NEXT_PUBLIC_REALTIME_PROXY_URL` can stay empty. The app falls back to the local Gateway.

For production browser/PWA usage, the app can infer `wss://<current-host>/realtime` from the deployed HTTPS host, or you can set `NEXT_PUBLIC_REALTIME_PROXY_URL` during build.

For Android builds, provide your own Gateway URL through `REALTIME_PROXY_URL` or the build script parameter. Do not build an app that points to someone else's Gateway.

## Usage

### Conversation Mode

1. Select source language.
2. Select target language.
3. Start real-time conversation.
4. The app detects speech automatically.
5. The app displays original subtitles, translated subtitles, and optional voice playback.

### Push-To-Talk Mode

1. Hold the push-to-talk button.
2. Speak in the selected source language.
3. Release the button.
4. The app translates speech into the selected target language.
5. The app generates translated subtitles and speech playback.
6. After playback, the app restores Conversation Mode automatically.

## Android Client

The Android client is built with Capacitor and packages the current web UI into an Android app.

Prepare Android assets with your own Gateway URL:

```powershell
$env:REALTIME_PROXY_URL = "wss://your-gateway.example.com/realtime"
npm run app:android:sync
```

Build a debug APK:

```powershell
$env:REALTIME_PROXY_URL = "wss://your-gateway.example.com/realtime"
npm run app:android:apk
```

More details: [docs/android-app.md](docs/android-app.md).

## Deployment

AI-Translator supports two self-hosted deployment paths.

### Alibaba Function Compute

The existing Alibaba Function Compute path remains supported:

- Web Function.
- Custom Runtime.
- ZIP code package.
- HTTP Trigger.
- One web service serving `/` and `/realtime`.

Deployment docs:

- [docs/v0.3-mobile-deployment.md](docs/v0.3-mobile-deployment.md)
- [deploy/aliyun-fc/README.md](deploy/aliyun-fc/README.md)

### Docker / Self-Hosted

The Docker deployment runs the same Gateway/Web service:

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

Quick start with the mock provider:

```bash
docker compose -f deploy/docker/docker-compose.yml up --build
```

Docker docs:

- [deploy/docker/README.md](deploy/docker/README.md)

Docker can be used on hosts that support long-lived WebSocket connections, such as VPS hosts, container hosting platforms, or cloud container services.

Users need their own AI provider credentials, their own Gateway, and are responsible for AI API and cloud resource costs. This project does not provide a shared public paid Gateway.

## Cost Responsibility

AI-Translator source code is open source. Users are responsible for:

- Their AI provider API usage.
- Their Gateway hosting.
- Their cloud resources.

The project maintainer does not provide a shared paid AI API or Gateway.

## Development

Common commands:

```bash
npm run doctor
npm run test:gateway
npm test
npm run lint
npm run build
npm run build:fc-server
```

Gateway security tests:

```bash
npm run test:gateway-security
```

FC environment tests:

```bash
npm run test:fc-env
```

## Documentation

- [Gateway security](docs/security.md)
- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Realtime provider architecture](docs/provider-architecture.md)
- [Android app](docs/android-app.md)
- [V0.2 end-to-end checklist](docs/v0.2-e2e-test-checklist.md)
- [V0.2 release notes](docs/v0.2-release-notes.md)
- [V0.3 mobile deployment](docs/v0.3-mobile-deployment.md)

## Roadmap

Planned improvements:

- Improve translation quality.
- Add more language support.
- Improve mobile experience.
- Optimize latency.

## Known Limitations

- The current production realtime provider is Bailian.
- Other providers require their own realtime adapter and compatible speech/audio capability.
- Push-To-Talk Mode submits selected source-language turns rather than running as continuous always-on two-way speech.
- Browser audio playback can require a user gesture depending on the browser.
- In-memory Gateway limits and rate limits do not coordinate across multiple server instances.
- Users are responsible for their own AI API usage and cloud costs.

## License

MIT. See [LICENSE](LICENSE).
