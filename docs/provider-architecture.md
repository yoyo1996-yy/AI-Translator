# Realtime Provider Architecture

The realtime Gateway is split into two layers:

```text
Client
  -> Gateway protocol
  -> RealtimeProvider interface
  -> Provider adapter
  -> AI model provider
```

The public client-facing WebSocket path remains `/realtime`. Existing apps continue to receive the same `proxy.status`, `proxy.ready`, `proxy.error`, `proxy.mode_ready`, and upstream realtime event payloads.

## Gateway Protocol

The Gateway owns:

- Client WebSocket lifecycle.
- Optional `APP_ACCESS_TOKEN` authentication.
- Resource limits and rate limits.
- Translation direction state.
- Push-to-talk control flow.
- Backward-compatible client events.

The Gateway does not build provider-specific audio append, commit, finish, or session update events directly.

## Provider Adapter

Provider adapters implement:

```ts
RealtimeProvider
```

Current adapters:

- `server/providers/bailian-provider.ts`: production Bailian realtime adapter.
- `server/providers/mock-provider.ts`: local test adapter with no external network calls.
- `server/providers/test-provider.ts`: secondary lifecycle test adapter for validating provider extensibility.

Provider selection is centralized in `server/providers/index.ts`.

```env
TRANSLATION_PROVIDER=bailian
```

Supported values are `bailian`, `mock`, and `test`.

The default provider is `bailian`, so existing deployments keep the same behavior unless this variable is changed.

## Language Capabilities

Provider adapters expose language support through `getCapabilities()`.

The shared language registry defines the public language codes and display labels. Provider-specific language code mappings must stay inside the provider adapter. The UI and Gateway should use public language codes such as `zh`, `ja`, and `en`, not provider-specific model codes.

Current validated languages:

- Chinese (`zh`)
- Japanese (`ja`)
- English (`en`)

## Adding Another Provider

To add another provider:

1. Create a new adapter that implements `RealtimeProvider`.
2. Translate neutral Gateway calls such as `updateSession`, `sendAudio`, `commitAudio`, and `finishSession` into that provider's protocol.
3. Translate provider events back into the Gateway-compatible event stream expected by the current client.
4. Declare provider language capabilities with `getCapabilities()`.
5. Add focused tests using the adapter through `providerFactory`.

Do not expose provider API keys to frontend, Android assets, or public repository files.
