# Configuration

AI-Translator is designed for self-hosted deployments. Provider API keys must stay on the server-side Gateway and must never be placed in browser code, Android assets, screenshots, or public repository files.

## Minimal Local Test

Use the mock provider for the first local validation. This mode does not call a paid AI API.

```env
TRANSLATION_PROVIDER=mock
REALTIME_PROXY_PATH=/realtime
APP_ACCESS_TOKEN=
```

Then run:

```bash
npm run doctor
npm run test:gateway
npm run dev:all
```

On Windows PowerShell, you can temporarily force mock mode with:

```powershell
$env:TRANSLATION_PROVIDER = "mock"
npm run doctor
```

## Bailian Provider

Set `TRANSLATION_PROVIDER=bailian` only when you are ready to use your own Bailian realtime provider credentials.

Required server-side variables:

```env
TRANSLATION_PROVIDER=bailian
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
DASHSCOPE_REGION=cn-beijing
```

The Gateway only reports whether these values are `configured` or `missing`. It must not print the real API key, token, or workspace value.

## Gateway

Common Gateway variables:

```env
PORT=3001
REALTIME_PROXY_PATH=/realtime
APP_ACCESS_TOKEN=
```

`APP_ACCESS_TOKEN` is optional. When empty, Gateway authentication is disabled for personal deployments. When set, clients must authenticate before using the realtime session.

Resource protection variables:

```env
MAX_SESSION_DURATION_SECONDS=
MAX_AUDIO_BYTES_PER_SESSION=
MAX_MESSAGE_SIZE_BYTES=
MAX_CONCURRENT_SESSIONS_PER_CLIENT=
RATE_LIMIT_WINDOW_SECONDS=
MAX_CONNECTION_ATTEMPTS_PER_WINDOW=
```

Leave these empty to use the built-in defaults.

## Client

For local web development, this can stay empty:

```env
NEXT_PUBLIC_REALTIME_PROXY_URL=
NEXT_PUBLIC_TRANSLATION_PROVIDER=
```

When empty, the web client uses the local Gateway in development or infers `wss://<current-host>/realtime` on HTTPS deployments.

`NEXT_PUBLIC_TRANSLATION_PROVIDER` is optional and contains only a provider name, not a secret. It lets the frontend language selector use the same provider capability registry as the Gateway. Leave it empty for Bailian-compatible language options.

For Android builds, configure your own Gateway URL during asset sync/build:

```powershell
$env:REALTIME_PROXY_URL = "wss://your-gateway.example.com/realtime"
npm run app:android:sync
```

Do not build an Android app that points to the repository owner's Gateway or any Gateway you do not control.

## Provider Selection

Supported values:

```env
TRANSLATION_PROVIDER=bailian
TRANSLATION_PROVIDER=mock
TRANSLATION_PROVIDER=test
```

Use `mock` for free local smoke tests. Use `bailian` for the current production realtime provider. Use `test` only for adapter lifecycle validation.

## Languages

Current validated languages:

- Chinese (`zh`)
- Japanese (`ja`)
- English (`en`)

The UI language selector is generated from the selected provider's language capabilities. Additional languages can be added to the language registry, but they should not be documented as available until a provider adapter declares and verifies support.

The product UI uses a user-facing language profile:

- `My Language`
- `Other Person's Language`

Conversation Mode maps this profile to `Other Person's Language -> My Language`.

Push-To-Talk Mode maps this profile to `My Language -> Other Person's Language`.

The Gateway protocol still uses `sourceLanguage` and `targetLanguage`. The product layer maps the profile before sending a session request.

The Gateway rejects unsupported language pairs before starting a provider session. `sourceLanguage` and `targetLanguage` must be different.

## Security

- Never put AI provider API keys in the browser or Android bundle.
- Never commit `.env.local`, private keys, signing files, or deployment secrets.
- Public Gateways can consume paid AI resources. Protect them with `APP_ACCESS_TOKEN` or another trusted access-control layer.
- Users are responsible for their own AI provider usage, Gateway hosting, and cloud resource costs.
