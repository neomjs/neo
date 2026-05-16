/**
 * **Visible** template-anchor substrings — checked and explicitly named in the error response
 * when missing.
 *
 * These are the 7 evaluation-metric tags from `.agents/skills/pr-review/assets/pr-review-template.md`
 * (cycle-1) and `.agents/skills/pr-review/assets/pr-review-followup-template.md` (cycle-N). They are
 * also the regex parse keys that `ai/daemons/services/ConceptDiscoveryService.mjs` consumes during
 * Retrospective-daemon REM-sleep graph ingestion — a malformed review with hallucinated metric
 * names produces zero graph ingest signal and is silently lost from the Native Edge Graph.
 *
 * Cycle-followup templates use the same 7 metric tags (`pr-review-followup-template.md:96-102`)
 * so this set applies to both cycle-1 and cycle-N reviews without false-positive separation.
 *
 * Extension protocol: if the pr-review skill adds a new evaluation metric, append the literal
 * `[NEW_TAG]` string here AND update both template files in the same PR.
 */
export const VISIBLE_PR_REVIEW_ANCHORS = [
    '[ARCH_ALIGNMENT]',
    '[CONTENT_COMPLETENESS]',
    '[EXECUTION_QUALITY]',
    '[PRODUCTIVITY]',
    '[IMPACT]',
    '[COMPLEXITY]',
    '[EFFORT_PROFILE]'
];

/**
 * **Invisible** template-anchor substrings — checked SILENTLY; NOT named in the error response
 * on miss. Defeats Goodhart anchor-stuffing (#11491 operator-directed enhancement 2026-05-16T21:16Z+).
 *
 * **Failure-mode the invisible layer prevents**:
 * A sophisticated agent receives the visible-list error, hallucinates a body that contains
 * exactly the named visible anchors but omits the actual template structure (e.g., bare
 * `### Strategic-Fit` heading without `Decision`, `### Metrics` without proper structure).
 * Visible-only validation passes the malformed body. The invisible layer catches this by
 * checking structural anchors that span both cycle-1 and cycle-followup templates.
 *
 * **Empirical anchor**: review `4304287893` on PR #11499 (2026-05-16T21:16:25Z) contained
 * all 7 visible metric tags but missed `Depth Floor`, `Required Actions`, and
 * `Strategic-Fit Decision` (only had bare `Strategic-Fit`). The 3-minute-later corrected
 * review `4304295863` (21:19:24Z) had all three. These 3 substrings empirically distinguish
 * a structurally-correct review from a metric-tag-stuffed hallucination.
 *
 * **Why these specific substrings**:
 * - `Depth Floor` — cycle-1 has `🔬 Depth Floor`, cycle-followup has `Delta Depth Floor`. Both contain the substring.
 * - `Required Actions` — both cycle-1 (`📋 Required Actions`) and cycle-followup carry the literal heading.
 * - `Strategic-Fit Decision` — cycle-1 (`🪜 Strategic-Fit Decision`) and cycle-followup (`Strategic-Fit Decision`)
 *   both include the word `Decision`. Hallucinated headings that drop `Decision` (as Gemini's
 *   review `4304287893` did) fail this check.
 *
 * **Asymmetry that makes this work**:
 * - Author who reads `.agents/skills/pr-review/SKILL.md` and follows the template → all checks pass
 * - Author who hallucinates from the visible-list error → fails invisible check, retries
 * - Author who enumerates `## ` headings to anchor-stuff → fails because the invisible substrings
 *   require specific phrasing (e.g., `Decision` postfix on `Strategic-Fit`) that's hard to guess
 *   without reading the actual template
 *
 * **Discoverability vs. invisibility tension**: this list IS the substrate; future maintainers
 * editing this constant must understand the invisibility rationale. Hence this docstring. The
 * list is NOT documented in error responses, public README, or skill-file enumerations — only
 * here in the validator's source, where modification requires explicit awareness.
 *
 * **Maintenance protocol**: if the pr-review template adds or renames a structural section,
 * update this array to point at substrings that still distinguish valid from invalid bodies.
 * Tests in `PullRequestService.spec.mjs` assert behavior without naming invisible anchors in
 * prose; they import this constant by reference.
 */
export const INVISIBLE_PR_REVIEW_ANCHORS = [
    'Depth Floor',
    'Required Actions',
    'Strategic-Fit Decision'
];
