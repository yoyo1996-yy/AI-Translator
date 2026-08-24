# AI-Translator / AI 随身同传

AI-Translator is a self-hostable realtime AI translation framework with a web client, an Android client, and a server-side realtime Gateway.

It helps you build a private speech translation app where the frontend connects to your own Gateway, and the Gateway connects to an AI realtime model provider without exposing provider API keys to the browser or mobile app.

Current app focus:

- Other speaker: Japanese or English speech to Chinese subtitles and Chinese speech playback.
- User speech: push-to-talk Chinese to Japanese or English subtitles and speech playback.
- Personal self-hosted deployment for browser, PWA, and Android usage.

## Features

- Realtime speech translation through a WebSocket Gateway.
- Japanese to Chinese and English to Chinese listening modes.
- Chinese to Japanese and Chinese to English push-to-talk translation.
- Source subtitles, translated subtitles, and translated speech playback.
- Web client built with Next.js.
- Installable PWA metadata and mobile-oriented layout.
- Android client built with Capacitor.
- Server-side Gateway for hiding provider API keys from clients.
- Provider abstraction layer with a production Qwen/Bailian adapter and a mock provider for tests.
- Optional Gateway access token authentication with `APP_ACCESS_TOKEN`.
- Basic Gateway resource limits and in-memory rate limiting.
- Self-host deployment preparation for Alibaba Cloud Function Compute Custom Runtime ZIP packages.

## Architecture

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

The Provider Layer is designed to be extensible. The current production provider is Qwen/Bailian realtime. A mock provider is included for local tests. Other providers can be added by implementing the realtime provider interface described in [docs/provider-architecture.md](docs/provider-architecture.md).

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
- AI provider credentials for the realtime provider you use.

Clone and install:

```bash
git clone <your-fork-or-repository-url>
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

Fill in your own server-side credentials in `.env.local`:

```env
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

Run the local development app:

```bash
npm run dev:all
```

Open:

```text
http://127.0.0.1:3000/
```

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
NEXT_PUBLIC_REALTIME_PROXY_URL=
REALTIME_PROXY_PATH=/realtime
APP_ACCESS_TOKEN=
```

For local development, `NEXT_PUBLIC_REALTIME_PROXY_URL` can stay empty. The app falls back to the local Gateway.

For production browser/PWA usage, the app can infer `wss://<current-host>/realtime` from the deployed HTTPS host, or you can set `NEXT_PUBLIC_REALTIME_PROXY_URL` during build.

For Android builds, provide your own Gateway URL through `REALTIME_PROXY_URL` or the build script parameter. Do not build an app that points to someone else's Gateway.

## Usage

### Other Speaker To Chinese

1. Select `日本語` or `English`.
2. Click `开始同传`.
3. Let the other speaker speak Japanese or English.
4. The app shows source subtitles, Chinese translation, and Chinese speech playback.

### Chinese Push-To-Talk

1. Hold `按住说中文`.
2. Speak one Chinese utterance.
3. Release the button.
4. The app generates target-language subtitles and speech.
5. After playback, the app restores listening mode automatically.

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

The current documented production path is Alibaba Cloud Function Compute:

- Web Function.
- Custom Runtime.
- ZIP code package.
- HTTP Trigger.
- One web service serving `/` and `/realtime`.

Deployment docs:

- [docs/v0.3-mobile-deployment.md](docs/v0.3-mobile-deployment.md)
- [deploy/aliyun-fc/README.md](deploy/aliyun-fc/README.md)

Other deployment targets are possible as long as they can run a Node.js HTTP/WebSocket server and expose HTTPS/WSS publicly.

## Development

Common commands:

```bash
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
- [Realtime provider architecture](docs/provider-architecture.md)
- [Android app](docs/android-app.md)
- [V0.2 end-to-end checklist](docs/v0.2-e2e-test-checklist.md)
- [V0.2 release notes](docs/v0.2-release-notes.md)
- [V0.3 mobile deployment](docs/v0.3-mobile-deployment.md)

## Known Limitations

- The current production realtime provider adapter is Qwen/Bailian.
- Other providers require their own realtime adapter and compatible speech/audio capability.
- Chinese to Japanese/English uses push-to-talk rather than continuous always-on two-way speech.
- Browser audio playback can require a user gesture depending on the browser.
- In-memory Gateway limits and rate limits do not coordinate across multiple server instances.
- Users are responsible for their own AI API usage and cloud costs.

## License

MIT. See [LICENSE](LICENSE).
