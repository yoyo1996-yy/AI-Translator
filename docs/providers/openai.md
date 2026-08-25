# OpenAI Realtime Translation Provider

AI-Translator can use OpenAI Realtime Translation as an opt-in realtime provider.

Default deployments still use Bailian unless `TRANSLATION_PROVIDER=openai` is set.

## Configuration

Set these variables on the Gateway/server only:

```env
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-translate
```

`OPENAI_REALTIME_MODEL` is optional and defaults to `gpt-realtime-translate`.

Do not create `NEXT_PUBLIC_OPENAI_API_KEY`. Do not put `OPENAI_API_KEY` in browser code, Android assets, screenshots, or public repository files.

## Supported Project Languages

The project currently declares the same validated language set for OpenAI as the other providers:

- Chinese (`zh`)
- Japanese (`ja`)
- English (`en`)

Additional languages should be added only after they are validated in the product flow.

## Security Model

The frontend and Android app connect only to the AI-Translator Gateway. The Gateway reads `OPENAI_API_KEY` from server-side environment variables and connects to OpenAI.

Each user supplies their own OpenAI credentials. API usage is billed directly by OpenAI to the account that owns the API key. The project maintainer does not provide shared paid credentials.

For public Gateway deployments, consider enabling `APP_ACCESS_TOKEN` so unknown clients cannot consume your paid provider quota.

## Local Test

Run fixture and Gateway tests without contacting OpenAI:

```bash
npm test
npm run test:gateway
```

Run diagnostics in OpenAI mode:

```powershell
$env:TRANSLATION_PROVIDER = "openai"
npm run doctor
```

The doctor command reports only whether `OPENAI_API_KEY` is configured or missing.

## Docker Deployment

`deploy/docker/env.example` defaults to `TRANSLATION_PROVIDER=mock` so first-time Docker validation does not call a paid AI provider.

To use OpenAI in Docker, copy the example environment file and set:

```env
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-translate
```

## Optional Paid Integration Test

Default tests and CI must not call OpenAI.

Only run paid integration validation when you explicitly opt in:

```powershell
$env:RUN_OPENAI_INTEGRATION_TEST = "1"
$env:OPENAI_API_KEY = "<your-server-side-key>"
```

Do not enable this in public CI unless you intentionally accept the cost and secure the secret.
