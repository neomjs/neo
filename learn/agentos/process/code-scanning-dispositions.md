# Code-Scanning Dispositions

Authoritative in-repo record of **why** each dismissed CodeQL alert was dismissed.

**Origin:** issue #17512, from the 2026-08-21 code-scanning triage. **Empirical anchor:** alert 113 and alerts 62/63 fire under the *same* rule id — one was a real defect, the others are intentional. Any artifact that flattened that distinction would have been wrong.

**Mental model:** a dismissal is a decision. GitHub stores the *outcome*; this file stores the *reasoning*, because the reasoning is what the next reader needs and the security tab is not somewhere they will think to look.

## Why this file exists rather than a config

The obvious move — whitelist the rule where it is intentional — **cannot be expressed.** Verified against the GitHub documentation, not assumed:

| mechanism | scope | usable here |
|---|---|---|
| `query-filters` | by query **id** or **tags** | ❌ cannot be scoped to a path |
| `paths` / `paths-ignore` | excludes a file from **every** query | ❌ blinds the file to all rules |
| inline source suppression | — | ❌ not supported for CodeQL alerts |

So per-alert dismissal in the UI is not a workaround; it is **the only mechanism with the right granularity**. What it lacks is durability of reasoning, which is this file's job.

**The trap this file exists to prevent:** reaching for a global `query-filters` exclusion because the rule "keeps firing on intentional code". Alert 113 (`js/prototype-pollution-utility`, `buildScripts/docs/generateDocsJson.mjs`) was a genuine defect under exactly that rule id — a namespace walker that consulted inherited properties and could write to `Object.prototype`. A blanket exclusion would have hidden it.

> **A shared rule id does not imply a shared disposition.** Each path is judged on its own intent.

## Before dismissing

1. **Read the flagged code**, not the rule's name. A rule name describes a taint-source *category*; refuting the category does not refute the sink. (`js/shell-command-injection-from-environment` on a path derived from `__dirname` is still a path reaching a shell — see #17492.)
2. **Measure reachability**, do not argue it. Enumerate the call sites and name what feeds them.
3. **Pick the accurate GitHub reason.** "Used in test code" / "Used in a safe context" / "Won't fix" are different claims. `False positive` asserts the analysis is wrong; if the pattern is real and merely unreachable, that reason is untrue and puts a wrong fact in the tab.
4. **Add a row here**, and a note at the site if the code would otherwise read as an oversight.
5. **Dismissal is operator-owned.** An agent prepares the reason and the evidence; @tobiu applies it. Suppressing a security finding is not an agent's call.

## Ledger

| Alert | Rule | Path | Disposition | Reason | Decided |
|---|---|---|---|---|---|
| 62 | `js/prototype-pollution-utility` | `src/Neo.mjs:563` | Dismiss — *used in a safe context* | `Neo.merge` is deliberate framework config merging. `for…in` does enumerate a JSON-parsed `__proto__`, so the pattern is real — but all **19** call sites across `src/` and `apps/` take author-controlled config; none is fed from `JSON.parse`, fetch, response body, or query parameters. Not a false positive: the analysis is right about the shape and wrong about the reach. | @tobiu, pending |
| 63 | `js/prototype-pollution-utility` | `src/Neo.mjs:565` | Dismiss — *used in a safe context* | Same statement pair as 62; same evidence. | @tobiu, pending |
| 113 | `js/prototype-pollution-utility` | `buildScripts/docs/generateDocsJson.mjs:91` | **Fixed**, not dismissed | Same rule id, opposite disposition. A docs-generator namespace walker with no intent to touch prototypes; `if (!current[k])` consulted inherited properties, so `a.constructor.b` wrote to `Object.prototype.constructor` and `__proto__.x` reached every object. PR #17496. | Grace, 2026-08-21 |
| 41, 42 | `js/identity-replacement` | `buildScripts/util/templateBuildProcessor.mjs:120,182` | **Fixed** | `part.replace(/'/g, "\'")` replaced each apostrophe with itself. PR #17485. | Grace, 2026-08-21 |
| 64 | `js/shell-command-injection-from-environment` | `buildScripts/build/highlightJs.mjs:53` | **Fixed** | Initially assessed as a false positive because the path derives from `__dirname` rather than the environment. True, and it does not reach the hazard: a checkout path containing a space split the clone target into three arguments. PR #17493. | Grace, 2026-08-21 |

## Rejected alternatives

**A `codeql-config.yml` with a global rule exclusion.** Would hide the next alert-113. Not added — and an empty config file is worse than none, because it invites the exclusion later.

**`paths-ignore: src/Neo.mjs`.** Suppresses one rule by blinding every rule on the framework's root file.

**Guarding `__proto__` / `constructor` / `prototype` inside `Neo.merge`.** Proposed and withdrawn during #17512. Reachability is nil today, the cost lands on a hot-path config merge, and "a future caller might be undisciplined" is thin against an explicit statement of intent from the design owner. Revisit only if `Neo.merge` gains a caller fed by parsed or remote data — that is the falsifier, and it is checkable with one grep.
