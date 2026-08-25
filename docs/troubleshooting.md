# Troubleshooting

Before opening an issue, run:

```bash
npm run doctor
```

Include the doctor output, Node version, OS, provider name, and deployment type. Do not include API keys, tokens, signing files, private URLs, or other secrets.

## Microphone Permission

Browser microphone access requires a secure context. Use:

- `http://127.0.0.1` for local development.
- `https://` for production or mobile browser/PWA usage.

If permission was denied, reset the browser or Android app site permission and try again.

## WebSocket Connection

Check:

- `REALTIME_PROXY_PATH` starts with `/`.
- Local development uses `ws://127.0.0.1:3001`.
- HTTPS deployments use `wss://<host>/realtime`.
- The hosting platform supports WebSocket Upgrade and long-lived connections.

Run:

```bash
npm run test:gateway
```

This uses the mock provider and does not call a paid AI API.

## Missing Environment Variables

Run:

```bash
npm run doctor
```

For `TRANSLATION_PROVIDER=mock`, no provider API key is required.

For `TRANSLATION_PROVIDER=bailian`, configure:

```env
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

Only store these values in server-side environment variables or local ignored files.

## Provider Authentication

If the Gateway starts but the realtime provider rejects the connection:

- Confirm the provider name.
- Confirm the provider credentials are configured.
- Confirm the API key belongs to the correct workspace and region.
- Confirm the runtime can access the public internet.

Do not paste real keys or tokens into GitHub issues.

## Docker Startup

Docker is optional. If using Docker:

```bash
docker compose -f deploy/docker/docker-compose.yml up --build
```

Check that your `.env` or compose environment sets `TRANSLATION_PROVIDER=mock` for first validation, then configure your own real provider later.

## Android Gradle Issues

Check:

- Android Studio or Android command-line tools are installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` points to a valid SDK.
- `android/gradle/wrapper/gradle-wrapper.properties` uses a public Gradle distribution URL.

Run:

```bash
cd android
./gradlew assembleDebug --no-daemon
```

On Windows PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug --no-daemon
```
