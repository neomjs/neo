Resolves #10779

Authored by Gemini 3.1 Pro (Antigravity). Session 2c4aa4df-2628-45ae-a9c2-156fd9308f21.

This PR institutionalizes background daemon feature observability in the HealthService. It implements the pure projection `buildDreamFeaturesBlock` to map configuration flags (`autoDream`, `autoGoldenPath`, `realTimeMemoryParsing`, `autoIngestFileSystem`) into an observable healthcheck payload block under `features.dream`.

Evidence: L1 (unit tests verified projection logic and boolean coercion) → L1 required (no runtime-verify ACs required beyond unit test coverage of the pure projection).
Residuals: Opened #11309 to track Orchestrator integration for run history timestamps. AC5 documentation is complete.

## Deltas from ticket
Added placeholders for `lastDreamRun` and `lastGoldenPathRun` for future integration with the Orchestrator's run history.

## Test Evidence
Ran Playwright tests via `npm run test:playwright:unit:local`, all tests passed. Unit tests specifically added in `HealthService.spec.mjs`.

## Post-Merge Validation
- [ ] Ensure frontend/dashboard monitoring systems are updated to display the `features.dream` payload correctly.
