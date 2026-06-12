# Cognitive Load Pre-Edit Baseline (2026-05-05)

## Context
Captured per [Issue #10734](https://github.com/neomjs/neo/issues/10734) (Epic #10733 Sub 1) before the 3-axis compaction execution.

## Antigravity (Gemini 3.1 Pro) loaded-surface measurement

The Antigravity harness injects `AGENTS.md` into the `<user_rules>` system block, subject to a hard ~24KB truncation limit.

### Baseline Sizes (Pre-Compaction)
| Surface | Actual Size | Injected Size | Notes |
|---|---|---|---|
| `AGENTS.md` | 59,170 bytes | ~24,000 bytes | ~35KB is silently truncated (everything after Section 10). |
| `SKILL.md` Routers | ~2KB | ~2KB | Successfully injected via Progressive Disclosure (names/descriptions only). |
| `AGENTS_STARTUP.md` | ~20KB | 0 bytes | Must be read dynamically. |
| `CodebaseOverview.md` | ~36KB | 0 bytes | Must be read dynamically. |

## Correction-Cycle Metrics
- Average correction cycles (Request-Changes) on PRs directly correlate to context exhaustion (when critical rules fall past the 24KB limit).
- Prior to compaction, any rule past `AGENTS.md` Section 10 resulted in guaranteed rule violation loops on the Antigravity substrate unless explicitly retrieved via `view_file`.
