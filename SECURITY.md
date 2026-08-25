# Security Policy

## Secrets

Do not commit real API keys, workspace IDs, access tokens, private keys, or cloud credentials.

Keep provider credentials such as `DASHSCOPE_API_KEY`, `DASHSCOPE_WORKSPACE_ID`, and `OPENAI_API_KEY` only in server-side environment variables. Never place paid provider credentials in frontend code, Android assets, screenshots, public documentation, or Git history.

## Gateway Access

If your Gateway is publicly reachable, configure `APP_ACCESS_TOKEN` or deploy behind your own access control. A public Gateway without authentication may allow other people to consume your AI provider quota.

## Cloud Costs

Each deployer is responsible for their own cloud resources, AI API usage, networking, storage, logs, and related costs.

## Reporting Vulnerabilities

Please report security issues privately to the project maintainer before public disclosure. Include affected version, reproduction steps, expected impact, and any relevant logs with secrets removed.
