# Changelog

## [0.2.0]

### Added

- Provider-neutral realtime translation architecture
- Bailian/Qwen realtime provider support
- OpenAI Realtime provider adapter
- Mock/Test provider for no-key onboarding and CI
- Configurable language capability registry
- User / peer language profiles
- Bidirectional conversation and push-to-talk language model
- Docker/self-hosted Gateway deployment path
- Self-service setup diagnostics with `npm run doctor`
- Cross-provider contract validation
- Fresh-clone Android validation
- GitHub Actions CI and protected PR workflow

### Changed

- Translation direction generalized from Chinese-specific naming to user/peer language semantics
- Web and Android clients decoupled from provider-specific implementation
- Android Gradle wrapper made portable for fresh clones
- Open-source configuration and deployment documentation expanded
- Gateway/provider boundaries made more portable

### Validated

- Languages: Chinese (`zh`), Japanese (`ja`), English (`en`)
- Fresh clone Node/Web/Gateway workflow
- Fresh clone Android debug build
- No-key mock onboarding
- Cross-provider contract tests

### Notes

- Bailian remains the default provider.
- OpenAI Realtime integration is implemented and contract-tested.
- Live paid OpenAI validation requires the user's own credentials and explicit opt-in; it was not run as part of the default release validation.
- Docker deployment support is included. The latest fresh-clone audit machine did not have Docker installed, so that specific runtime validation was skipped.
- Users provide their own AI provider credentials and deploy their own Gateway.
- AI API and cloud infrastructure costs are paid by the user/deployer.
