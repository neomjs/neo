# Neo-Code Debt-Scan Audit (Reviewer-Side Enforcement)

Reviewer-side gate for four recurring Neo-code anti-patterns that have produced retracted approvals: hardcoded swarm identities, hidden config/default literals, module-level helper functions inside Neo class files, and config-value massage instead of verbatim config reads.

## When This Audit Fires

Run this audit before approving any PR that touches Neo code under `ai/**` or agent-review substrate under `.agents/**`. Use the grep probes below as entry points, then apply reviewer judgment to the changed lines.

## Pattern 1: Hardcoded Swarm Identities

Block new logic/data literals for Neo-maintainer identities outside the authoritative identity-root substrate.

Probe:

```bash
rg -n "(@neo-[a-z0-9-]+|tobiu)" ai .agents
```

Allowed:
- `ai/graph/identityRoots.mjs`, where Neo's current identity roots are intentionally declared.
- Narrative documentation or historical issue/PR excerpts that quote identity names as prose, not executable routing/config data.
- Test fixtures that intentionally verify identity parsing and cannot use neutral fixture identities without losing the assertion.

Required Action:

> *"PR adds hardcoded Neo-maintainer identity literals outside `ai/graph/identityRoots.mjs`. Required: read the roster from the identity-root substrate, an existing identity service, or neutral test fixtures; do not add new `@neo-*` / `tobiu` logic or config literals."*

## Pattern 2: Hidden Config / Default Literals

Block new operational defaults, thresholds, provider selectors, retention/cadence values, or context limits encoded as module-local constants when they should be operator-visible config.

Probe examples:

```bash
rg -n "const\s+(DEFAULT_[A-Z0-9_]+|[A-Z0-9_]+_(MS|LIMIT|THRESHOLD|TIMEOUT|INTERVAL|COUNT)|OPEN_AI_COMPATIBLE_PROVIDER)\s*=" ai .agents
rg -n "\?\?\s*(['\"][^'\"]+['\"]|[0-9]+|true|false)" ai .agents
```

The anti-pattern is not limited to numbers. A string sentinel like a provider default, a boolean fallback, or a numeric threshold is still debt when it silently chooses runtime behavior. Concrete defaults belong in the authoritative config surface (usually `ai/config.template.mjs` and its `aiConfig` leaf/env plumbing) or in an existing registry consumed verbatim.

Allowed:
- Constants that name an imported authoritative config key without introducing the value.
- Pure formatting literals, regexes, enum-member imports, and local derived values that do not pick runtime defaults or operator policy.
- Test-only literals that are explicit input data for the assertion, not fallback behavior.

Required Action:

> *"PR adds hidden config/default literals in code. Required: move the concrete default to the authoritative config/registry surface and consume it verbatim; do not keep a parallel `DEFAULT_*`, provider-selector, threshold, timeout, context-limit, or boolean fallback in implementation code."*

## Pattern 3: Config-Value Massage

Block new fallback chains or conditional resets that rewrite one config value into another runtime shape. Config picks the selection; implementation code reads that selection verbatim.

Probe examples:

```bash
rg -n "config\.[A-Za-z0-9_]+ *\|\| *config\.[A-Za-z0-9_]+|config\.[A-Za-z0-9_]+ *\?\? *config\.[A-Za-z0-9_]+" ai .agents
rg -n "\? *[^:]*config\.[A-Za-z0-9_]+[^:]*: *null|null *: *[^?]*config\.[A-Za-z0-9_]+" ai .agents
```

Blocked examples:
- `config.modelProvider || config.chatProvider`
- `config.embeddingProvider ?? config.chatProvider`
- `usesLocal ? config.openAiCompatible?.model : null`

Allowed:
- Pure presence checks that guard optional behavior without rewriting or replacing the config value.
- Normalizing user input before it reaches the authoritative config surface.
- Explicit test fixtures that assert fallback rejection or legacy compatibility behavior.

Required Action:

> *"PR massages config values instead of reading the authoritative selection verbatim. Required: move provider selection, model selection, or null/disable behavior into the config surface and consume that resolved value directly; do not add `||` / `??` chains between config fields or conditional null-reset of config values in implementation code."*

## Pattern 4: Module-Level Helpers In Neo Class Files

Block new module-level helper declarations in files that define a Neo class. Behavior belongs on the owning class as an instance, static, or private method so the class blueprint remains introspectable.

Class-file discriminator:

```bash
rg -c "extends Base|Neo\.setupClass" <file>
```

If the count is greater than `0`, check for module-scope helpers:

```bash
rg -n "^(export\s+)?(async\s+)?function\s+[A-Za-z0-9_]+\s*\(" <file>
```

Allowed:
- Pure helper modules that do not define a Neo class.
- `ai/scripts/**` maintenance scripts.
- Framework-supported functional components or tiny entrypoint glue files that are not Neo class files.

Required Action:

> *"PR adds module-level helper functions inside a Neo class file. Required: move the helper onto the owning class as an instance/static/private method, or split it into a pure helper module if it is truly class-independent."*

## Review Discipline

This scan is a separate battery from functional V-B-A. Run it even after a clean functional pass; green CI and passing tests verify behavior, not shape. Any in-scope hit is a **Request Changes** finding, not an Approve+Follow-Up item. Green CI, passing tests, or "pre-existing adjacent debt" do not excuse newly added instances of these patterns. If a grep probe matches only an allowed carve-out, record that in the review evidence and continue.
