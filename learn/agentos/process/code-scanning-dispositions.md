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
3. **Pick a reason the API actually accepts, and one that is true.** The only values are `false positive`, `won't fix`, `used in tests`, `mitigated` and `null` — verified against the REST contract, because the first draft of this file invented one that does not exist. They are different claims: `false positive` asserts the analysis is wrong, which is untrue whenever the pattern is real and merely unreachable. If none of the five is honest for your case, that is a signal the alert wants fixing rather than dismissing.
4. **Add a row here**, and a note at the site if the code would otherwise read as an oversight.
5. **Dismissal is operator-owned.** An agent prepares the reason and the evidence; @tobiu applies it. Suppressing a security finding is not an agent's call.

## Ledger

| Alert | Rule | Path | Disposition | Reason | Decided |
|---|---|---|---|---|---|
| 62, 63 | `js/prototype-pollution-utility` | `src/Neo.mjs:563,565` | **NOT dismissed — being fixed** | Proposed for dismissal here and **falsified before it landed** (see the retraction below). | superseded |
| 113 | `js/prototype-pollution-utility` | `buildScripts/docs/generateDocsJson.mjs:91` | **Fixed**, not dismissed | Same rule id, opposite disposition. A docs-generator namespace walker with no intent to touch prototypes; `if (!current[k])` consulted inherited properties, so `a.constructor.b` wrote to `Object.prototype.constructor` and `__proto__.x` reached every object. PR #17496. | Grace, 2026-08-21 |
| 41, 42 | `js/identity-replacement` | `buildScripts/util/templateBuildProcessor.mjs:120,182` | **Fixed** | `part.replace(/'/g, "\'")` replaced each apostrophe with itself. PR #17485. | Grace, 2026-08-21 |
| 64 | `js/shell-command-injection-from-environment` | `buildScripts/build/highlightJs.mjs:53` | **Fixed** | Initially assessed as a false positive because the path derives from `__dirname` rather than the environment. True, and it does not reach the hazard: a checkout path containing a space split the clone target into three arguments. PR #17493. | Grace, 2026-08-21 |

## Rejected alternatives

**A `codeql-config.yml` with a global rule exclusion.** Would hide the next alert-113. Not added — and an empty config file is worse than none, because it invites the exclusion later.

**`paths-ignore: src/Neo.mjs`.** Suppresses one rule by blinding every rule on the framework's root file.

**Guarding `__proto__` / `constructor` / `prototype` inside `Neo.merge`.** Proposed, withdrawn, and then **reinstated** — the withdrawal rested on a reachability claim that did not survive a runtime probe. Tracked as its own ticket; this file records no dismissal for 62/63.

## ⚠️ Retraction — the first entry this file nearly got wrong

The rows above originally read *dismiss, used in a safe context*, on the argument that `Neo.merge`'s call sites all take author-controlled config. @neo-gpt-emmy falsified it by running the function instead of reading it:

```js
Neo.merge({}, JSON.parse('{"__proto__":{"probe":"reached"}}'));
Object.hasOwn(Object.prototype, 'probe'); // true
```

Reproduced independently. Three separate errors fed the wrong disposition, and they are recorded because the pattern matters more than the instance:

1. **The loop was read, the function was never run.** `for…in` yielding a parsed `__proto__` was verified in isolation; the end-to-end pollution never was.
2. **The census counted grep matches, not call expressions**, inflating the site count and, worse, framing an internal census as a security proof at all — `Neo.merge` is part of the public default export, so no repository census can bound its callers.
3. **`src/worker/Base.mjs:368,389` feed worker-message payloads straight in** — `Neo.merge(Neo.config, data)`. That is cross-thread input, and it was inside the census I had already run.

**And the dismissal reason did not exist.** GitHub's code-scanning API accepts `false positive`, `won't fix`, `used in tests`, `mitigated` or `null`. There is no *"used in a safe context"* — so the reason offered here was not applicable even had the premise held.

**The rule this file takes from its own first entry:** a dismissal argued from *reachability* requires the runtime probe, not a call census. Reading the code is how you form the hypothesis; running it is the evidence. For anything on a public export, an internal census cannot be the boundary at all.
