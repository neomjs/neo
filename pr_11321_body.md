Resolves #11321

This PR implements the `SkillSource` extractor for the Knowledge Base pipeline. It adheres to the fair distribution review constraints by:
1. Closing only #11321.
2. Dropping all unrelated substrate (`AGENTS.md`, `.agents/skills/*`) changes that were mistakenly imported into the previous PR (#11325).
3. Ensuring no OpenAPI schema (`openapi.yaml`) changes are included, as they are now governed by GPT under ticket #11326.
4. Ensuring no `DatabaseService.mjs` registration is included, as that is reserved for ticket #11322.

## Test Evidence
- Targeted unit test `test/playwright/unit/ai/services/knowledge-base/source/SkillSource.spec.mjs` passes.
- `git diff --check` passes with no trailing whitespaces.

## Evidence
- L1 (unit tests) -> L1 required. No external integration tests required for the standalone extractor logic.
