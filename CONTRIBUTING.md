# Contributing

Thank you for considering a contribution.

## Issues

Before opening an issue, please check existing issues and include:

- What you expected to happen.
- What actually happened.
- Your operating system, browser or Android version.
- Reproduction steps.
- Logs with API keys and tokens removed.

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
