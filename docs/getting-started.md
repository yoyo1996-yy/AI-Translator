# Getting Started

This guide validates the project without a real AI provider key first. The default setup uses the mock provider, so the first check does not create cloud resources and does not incur AI API cost.

## 1. Clone Repository

```bash
git clone https://github.com/yoyo1996-yy/AI-Translator.git
cd AI-Translator
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Create Local Configuration

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

For the first run, keep:

```env
TRANSLATION_PROVIDER=mock
```

## 4. Run Doctor

```bash
npm run doctor
```

Expected result for a basic local setup:

```text
Doctor result:
PASS
```

If the result is `PASS WITH WARNINGS` or `FAIL`, read the printed check names and see [troubleshooting.md](troubleshooting.md).

## 5. Test Mock Gateway

```bash
npm run test:gateway
```

This starts a temporary Gateway, checks `/health`, opens `ws://127.0.0.1:<port>/realtime`, waits for mock `proxy.ready`, and closes cleanly.

## 6. Start Project

```bash
npm run dev:all
```

Open:

```text
http://127.0.0.1:3000/
```

The development setup runs:

- Web frontend: `http://127.0.0.1:3000/`
- Local realtime Gateway: `ws://127.0.0.1:3001`

## 7. Optional: Configure Real Provider

After the mock setup works, configure your own provider credentials.

For Bailian:

```env
TRANSLATION_PROVIDER=bailian
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

For OpenAI Realtime Translation:

```env
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-translate
```

Do not use the repository owner's Gateway or API credentials. The maintainer does not provide a shared paid AI API or Gateway.

## 8. Optional: Build Android

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

## 9. Optional: Deploy

Self-hosting options:

- Docker / container hosting.
- Alibaba Function Compute Custom Runtime.

Users are responsible for their own AI provider API usage, Gateway hosting, and cloud resource costs.
