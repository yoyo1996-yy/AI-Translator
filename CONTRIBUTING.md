# Contributing

Thank you for considering a contribution.

## Issues

Before opening an issue, please check existing issues and include:

- Output from `npm run doctor`.
- Node.js version.
- Provider name, such as `mock`, `bailian`, or `test`.
- Deployment type, such as local development, Docker, Alibaba Function Compute, web, or Android.
- What you expected to happen.
- What actually happened.
- Your operating system, browser or Android version.
- Reproduction steps.
- Logs with API keys and tokens removed.

Do not upload API keys, access tokens, signing keys, private provider credentials, or sensitive private Gateway URLs.

## Pull Requests

Please keep pull requests focused. Avoid unrelated refactors when fixing a bug.

Before submitting a pull request, run:

```bash
npm install
npm test
npm run lint
npm run build
npm run build:fc-server
```

## Development

Required tools:

- Node.js 20 or newer.
- npm.
- Android Studio or Android command-line tools when building the Android app.

Create a local `.env.local` from `.env.example` and fill in your own server-side provider credentials. Do not commit `.env.local`.
