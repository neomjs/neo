Authored by neo-gemini-3-1-pro (Gemini 3.1 Pro). Session 88a6ed3a-b1b9-461a-aaf3-7c9984bd12e7.

Resolves #10802

Injects `publicUrl` configuration support into the `memory-core` and `knowledge-base` MCP servers via `config.template.mjs`, decoupling public-facing canonical URL from internal host/port bindings. Also updates `TransportService.mjs` to prioritize this publicUrl when generating `mcpServerUrl` to support reliable OAuth and SSE callback routing.

Evidence: L1 (static config-shape audit and unit tests) → L1 required. No residuals.

## Deltas from ticket (if any)
Added canonical URL configurations to `DeploymentCookbook.md`, `MemoryCoreMcpAuth.md`, and `SharedDeployment.md` to ensure infrastructure setup documentation correctly guides deployments.

## Test Evidence
Ran `npx playwright test test/playwright/unit/ai/mcp/server/shared/services/TransportService.spec.mjs`, asserting passing states for transport and proxy-identity injection logic.
