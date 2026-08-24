# Gateway Security

This project uses a server-side realtime Gateway between the mobile/web client and the paid AI provider.

```text
App / Browser
  -> Gateway /realtime
  -> AI provider realtime API
```

The provider API key must stay on the server. Never put `DASHSCOPE_API_KEY` in frontend code, Android assets, screenshots, public docs, or repository history.

## Personal deployment

For a private personal deployment, authentication can stay disabled:

```env
APP_ACCESS_TOKEN=
```

When `APP_ACCESS_TOKEN` is empty, the Gateway keeps the existing behavior. Current personal apps can connect without modification.

This mode is convenient, but anyone who knows the public Gateway URL can attempt to use the Gateway. Use it only when the URL is private enough for your risk tolerance and usage is monitored.

## Public deployment

For public or shared deployments, set a private access token:

```env
APP_ACCESS_TOKEN=replace-with-a-long-random-token
```

Clients must then connect to `/realtime` with:

```text
Authorization: Bearer <APP_ACCESS_TOKEN>
```

Backend or native clients that can set WebSocket headers may use the header method above. Browser/WebView clients can instead send this as the first WebSocket message before any audio or control message:

```json
{
  "type": "auth",
  "token": "<APP_ACCESS_TOKEN>"
}
```

Do not expose this token in public frontend bundles. If the app is distributed publicly, each deployer should configure their own Gateway and their own AI provider credentials. A shared public frontend cannot keep `APP_ACCESS_TOKEN` secret by itself.

## Resource limits

The Gateway supports in-memory resource protection:

```env
MAX_SESSION_DURATION_SECONDS=
MAX_AUDIO_BYTES_PER_SESSION=
MAX_MESSAGE_SIZE_BYTES=
MAX_CONCURRENT_SESSIONS_PER_CLIENT=
```

Empty values use safe defaults:

```text
MAX_SESSION_DURATION_SECONDS: 3600
MAX_AUDIO_BYTES_PER_SESSION: 134217728
MAX_MESSAGE_SIZE_BYTES: 1048576
MAX_CONCURRENT_SESSIONS_PER_CLIENT: 3
```

When a session exceeds a limit, the Gateway sends a `proxy.error` message and closes the session gracefully.

## Rate limiting

The Gateway applies basic in-memory IP-based connection rate limiting. It does not require a database.

Current defaults:

```text
RATE_LIMIT_WINDOW_SECONDS: 60
MAX_CONNECTION_ATTEMPTS_PER_WINDOW: 30
```

These variables can be configured if needed, but they are intentionally not required for personal deployment.

## Remaining risks

In-memory limits reset when the server restarts and do not coordinate across multiple Gateway instances. For multi-instance public deployments, add shared rate limiting at the platform, proxy, or edge layer.
