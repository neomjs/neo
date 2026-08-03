#!/usr/bin/env node
/**
 * @summary Discovers every retry-growth site in the tree and requires each one to carry an explicit
 * bound classification. Reports an unregistered site as `unclassified` — NEVER as `unbounded`.
 *
 * ## The rule
 *
 * Every retry-growth site in this repo is bounded. That is not the problem. The problem is that
 * **boundedness is only knowable by reading each site's caller**, and the bound lives in four
 * structurally different places:
 *
 * | carrier | example |
 * |---|---|
 * | `max-delay` | `Math.min(base * 2 ** attempt, CAP)` — the delay value itself is capped |
 * | `max-attempts` | the growth expression is raw; the CALLER's loop counter bounds it |
 * | `max-window` | a total elapsed/deadline budget bounds the series |
 * | `terminal-state` | the delay genuinely grows; a state transition stops the loop |
 *
 * So this guard does not try to prove boundedness. It discovers candidates and requires a human or
 * agent to declare, per site, the lifetime of the retry state, which carrier bounds it, and a
 * witness that proves the bound. Drift in either direction fails.
 *
 * ## Why `unclassified` and never `unbounded`
 *
 * The discovery patterns have a LARGER false-positive family than true-positive set — easing curves
 * (`1 - Math.pow(1 - progress, 3)`) and power-law random distributions match the same syntax as an
 * exponential backoff. A guard that called those violations would train contributors to suppress it,
 * which is how an invariant dies quietly. A new match therefore means "nobody has said what this is
 * yet", which is true, rather than "this is a defect", which usually is not.
 *
 * Non-retry matches are classified too (`kind: 'not-a-retry'`) with the same witness requirement, so
 * the false-positive family is RECORDED rather than silently dropped by a regex nobody can audit.
 *
 * ## Why sites are keyed by symbol, not line
 *
 * A `file:line` registry drifts on every unrelated edit above the site, so it would be re-baselined
 * constantly and the re-baseline is exactly where a real regression slips through. Sites are keyed
 * `<relPath>#<enclosingSymbol>`; the line is carried as informational drift-detection only.
 *
 * ## Scope
 *
 * Production `.mjs` under `ai/`, `src/`, `apps/`, `buildScripts/`. Specs and tests are excluded: a
 * test asserting backoff arithmetic is not a production retry site, and including them would make
 * the registry churn with every fixture.
 */
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    ROOT_DIR     = path.resolve(__dirname, '../../../'),
    REGISTRY_REL = 'ai/scripts/lint/retry-bound-registry.json',
    SCAN_ROOTS   = ['ai', 'src', 'apps', 'buildScripts'],

    SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'test', 'tests', 'coverage']),

    /**
     * Growth syntaxes. Deliberately broader than "literal base 2": an earlier hand census matched
     * only `Math.pow(2, …)` / `2 ** …`, reported five sites, and concluded there was nothing to
     * classify. The real set is nine — the misses were `backoff *= 2` (multiplicative mutation) and
     * `Math.pow(configurableMultiplier, attempts)` (non-literal base).
     */
    PATTERNS = [
        {id: 'pow',      re: /Math\.pow\s*\(/},
        {id: 'exponent', re: /[\w.)\]]\s*\*\*\s*[\w(]/},
        {id: 'mutate',   re: /\b(backoff|delay|interval|cooldown|wait|retry)\w*\s*\*=/i}
    ],

    /**
     * Retry vocabulary — the discriminator between "a growth expression" and "a retry growth
     * expression", which are not the same population.
     *
     * Without it the syntactic patterns above are indiscriminate, because exponentiation is how you
     * write Euclidean distance, easing curves, and byte-size formatting. Measured on the first
     * full-tree run: 34 of 62 candidates were outside `ai/`, and 3 of those 34 were retries — the
     * rest were `(x2 - x1) ** 2`, `Math.pow(1 - progress, 3)`, `1000 ** i`. A gate that asks a canvas
     * physics loop to declare its backoff cap is one developers learn to route around, and a
     * registry padded with 30 `not-a-retry` geometry entries records nothing worth reading.
     *
     * This narrows the POPULATION to the concern; it does not narrow the FINDINGS within it. Every
     * growth expression that is plausibly a retry still has to be classified with a witness.
     *
     * **Substring, not `\b`-delimited words.** The first draft used word boundaries and silently
     * dropped `tenantRepoSync#isRepoDue` — the site whose unbounded backoff once starved a tenant
     * sync lane for over a day, which is the failure this gate exists to prevent recurring. Its
     * expression reads `Math.pow(2, Math.max(0, consecutiveFailures))`, and `\bconsecutive\b` does
     * not match `consecutiveFailures` because a word character follows.
     * camelCase is the dominant identifier style here, so `\b` anchoring is precisely wrong for
     * matching identifiers, and its failure mode is silent omission of the highest-value sites.
     *
     * **Known false-negative:** a retry whose symbol, expression line, and filename all avoid this
     * vocabulary — `schedule()` doing `d = base * 2 ** n` — is invisible here. That is a real gap and
     * the honest bound on what this gate certifies: it proves the retries it can NAME are bounded,
     * not that every retry in the tree is.
     */
    RETRY_VOCABULARY = /(retry|retries|retried|backoff|attempt|reconnect|redeliver|requeue|resend|failure|failing|consecutive|throttle|cooldown|reprobe)/i,

    VALID_KIND     = new Set(['retry-growth', 'not-a-retry']),
    VALID_LIFETIME = new Set(['in-cycle', 'process-local', 'persisted']),
    VALID_CARRIER  = new Set(['max-delay', 'max-attempts', 'max-window', 'terminal-state']);

/**
 * Whether a source line is code rather than comment/JSDoc prose.
 *
 * @summary Prose is excluded by SHAPE, not by keyword: a JSDoc table describing `Math.pow` bounding
 * is not a site. Block-comment tracking is stateful because a `*`-prefixed continuation line is
 * indistinguishable from a multiplication when read alone.
 * @param {String} line Raw source line.
 * @param {Boolean} inBlockComment Whether the scanner is inside a block comment.
 * @returns {{isCode: Boolean, inBlockComment: Boolean}}
 */
export function classifyLine(line, inBlockComment) {
    const trimmed = line.trim();
    let   active  = inBlockComment;

    if (active) {
        return {isCode: false, inBlockComment: !trimmed.includes('*/')};
    }

    if (trimmed.startsWith('//')) {
        return {isCode: false, inBlockComment: false};
    }

    if (trimmed.startsWith('/*')) {
        return {isCode: false, inBlockComment: !trimmed.includes('*/')};
    }

    if (trimmed.startsWith('*')) {
        return {isCode: false, inBlockComment: false};
    }

    return {isCode: true, inBlockComment: active};
}

/**
 * Blanks string and template-literal contents so literal text cannot match a growth pattern.
 *
 * @summary Without this, every markdown `**bold**` span inside a prompt or a rendered-report
 * template literal matches the exponent pattern — on the first run that was ~20 of 50 hits, all
 * prose. Those are not a false-positive family worth CLASSIFYING (there is nothing to say about
 * them); they are a discovery-layer defect. Real false positives that survive this — easing curves,
 * power-law random — are genuine code and do get classified.
 *
 * Template literals spanning multiple lines carry their open state across the scan, because prompts
 * and rendered-report templates are exactly where multi-line markdown lives — leaving continuation
 * lines unstripped put five pure-prose entries in front of the classifier on the first run.
 * Single-quote/double-quote state deliberately does NOT carry: an unterminated `'` is a syntax
 * error, so treating it as open would silently blank the rest of the file.
 *
 * **`${…}` substitutions are PRESERVED.** They are executable code that merely lives inside a
 * template, and blanking them cost a real site: `src/form/field/FileUpload.mjs` computes
 * `` `${(bytes / (1000 ** i)).toFixed(…)}` `` and the first revision of this scanner could not see
 * it. Nesting is tracked by depth so a substitution containing its own template (or an object
 * literal's braces) closes at the right brace rather than the first one.
 * @param {String} line Raw source line.
 * @param {Boolean} [inTemplate=false] Whether the scanner is inside a multi-line template literal.
 * @returns {{code: String, inTemplate: Boolean}} Line with literal TEXT blanked, substitutions kept.
 */
export function stripLiterals(line, inTemplate = false) {
    let out        = '',
        quote      = inTemplate ? '`' : null,
        substDepth = 0;

    for (let i = 0; i < line.length; i++) {
        const char = line[i],
              prev = line[i - 1];

        // Inside a `${...}` substitution the content is code: emit it verbatim and track brace depth
        // so a nested template or object literal does not close the substitution early.
        if (substDepth > 0) {
            if (char === '{') substDepth++;
            if (char === '}') substDepth--;
            out += substDepth === 0 ? ' ' : char;
            continue;
        }

        if (quote) {
            if (quote === '`' && char === '$' && line[i + 1] === '{') {
                substDepth = 1;
                out       += '  ';
                i++;
            } else if (char === quote && prev !== '\\') {
                quote = null;
                out  += char;
            } else {
                out += ' ';
            }
        } else if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            out  += char;
        } else {
            out += char;
        }
    }

    return {code: out, inTemplate: quote === '`'};
}

/**
 * Fingerprints a matched expression so two sites in one function cannot share a key.
 *
 * @summary The key's discriminating half. `<path>#<symbol>` alone ALIASES: a second growth
 * expression added inside an already-registered function silently inherited that function's prior
 * classification and the gate stayed green — so a new retry site could enter a function already
 * classified `not-a-retry` and never be examined.
 *
 * Whitespace is collapsed so reformatting does not churn the registry, but the expression's TEXT is
 * load-bearing: changing the arithmetic changes the key, which forces re-classification. That is the
 * intended behaviour, not a cost — an edited bound is exactly when the old classification stops
 * being evidence.
 * @param {String} code Literal-stripped source line.
 * @returns {String} Eight hex characters.
 */
export function expressionFingerprint(code) {
    const normalized = code.replace(/\s+/g, ' ').trim();

    let hash = 0x811c9dc5;

    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash  = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash.toString(16).padStart(8, '0');
}

/**
 * Resolves the nearest enclosing named symbol above a line.
 *
 * @summary The registry key's stable half. Scans backwards for a function/method/arrow declaration;
 * falls back to `<module>` so a top-level site is still addressable rather than unkeyable.
 * @param {String[]} lines All source lines.
 * @param {Number} index Zero-based index of the matched line.
 * @returns {String}
 */
export function findEnclosingSymbol(lines, index) {
    const decl = [
        /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
        /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
        // `#private` methods are matched explicitly: without the `#` alternative they fell through
        // every pattern and keyed as `<module>`, so a private retry helper was indistinguishable
        // from a top-level one and two of them in a file would have collided.
        /^\s*(?:static\s+)?(?:async\s+)?(#?[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
        /^\s*(#?[A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function)?\s*\(/
    ];

    for (let i = index; i >= 0; i--) {
        for (const re of decl) {
            const match = lines[i].match(re);

            // `if (...) {` and friends match the method shape; excluding keywords keeps the key on a
            // real symbol rather than on control flow that happens to look like a signature.
            if (match && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(match[1])) {
                return match[1];
            }
        }
    }

    return '<module>';
}

/**
 * Walks the scan roots for production `.mjs` files.
 *
 * @param {String} dir Absolute directory.
 * @param {String[]} [acc=[]] Accumulator.
 * @returns {String[]} Absolute file paths.
 */
export function collectSourceFiles(dir, acc = []) {
    let entries;

    try {
        entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch (error) {
        return acc;
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!SKIP_DIR.has(entry.name)) {
                collectSourceFiles(full, acc);
            }
        } else if (entry.isFile() && entry.name.endsWith('.mjs') && !/\.spec\.mjs$/.test(entry.name)) {
            acc.push(full);
        }
    }

    return acc;
}

/**
 * Discovers every retry-growth candidate under the scan roots.
 *
 * @param {Object} [options]
 * @param {String} [options.rootDir=ROOT_DIR] Repo root.
 * @returns {Object[]} `[{key, file, line, symbol, pattern, snippet}]`, sorted by key.
 */
/**
 * Decides whether a growth expression sits in a retry context.
 *
 * @summary Reads three surfaces, any one of which is sufficient: the enclosing symbol name, the
 * expression's own line, and the file's basename. Three rather than one because a retry can be
 * named at any of them — `getRetryDelay` names it in the symbol, `backoffStrategy: attempt => …`
 * names it in the line, and a bare growth expression inside `boundedRetryGate.mjs` names it in the
 * file. A whole-function window was rejected: it drags in unrelated vocabulary from neighbouring
 * code and makes the verdict depend on where a function happens to end.
 *
 * @param {Object} options
 * @param {String} options.file Repo-relative path.
 * @param {String} options.line The raw source line holding the expression.
 * @param {String} options.symbol Enclosing symbol name.
 * @returns {Boolean}
 */
export function isRetryContext({file, line, symbol}) {
    return RETRY_VOCABULARY.test(symbol || '') ||
           RETRY_VOCABULARY.test(line   || '') ||
           RETRY_VOCABULARY.test(path.basename(file || ''))
}

export function discoverCandidates({rootDir = ROOT_DIR} = {}) {
    const candidates = [],
          seenKeys   = new Map();

    for (const root of SCAN_ROOTS) {
        for (const file of collectSourceFiles(path.join(rootDir, root))) {
            const rel   = path.relative(rootDir, file),
                  lines = fs.readFileSync(file, 'utf8').split('\n');

            let inBlockComment = false,
                inTemplate     = false;

            lines.forEach((line, index) => {
                const state = classifyLine(line, inBlockComment);
                inBlockComment = state.inBlockComment;

                // A comment line cannot open or close a template literal, but it also must not reset
                // one that a preceding code line left open.
                if (!state.isCode) return;

                const stripped = stripLiterals(line, inTemplate),
                      wasOpen  = inTemplate;

                inTemplate = stripped.inTemplate;

                // A continuation line inside a template is prose, not code, whatever it looks like.
                if (wasOpen) return;

                const hit = PATTERNS.find(p => p.re.test(stripped.code));

                if (!hit) return;

                const symbol = findEnclosingSymbol(lines, index);

                // PARTITION, never exclusion (@neo-gpt-emmy). An earlier revision `return`ed here,
                // which made a neutral-vocabulary retry — `schedule() { const d = base * 2 ** n }` —
                // silently invisible: the gate went green with fewer candidates and nothing said why.
                // Every growth expression is now discovered and reported; `retryContext` decides only
                // whether classification is REQUIRED, so completeness and signal stop competing.
                const retryContext = isRetryContext({file: rel, line, symbol});

                // The occurrence ordinal distinguishes two IDENTICAL expressions in one symbol, which
                // share a fingerprint by construction. Without it the second collapses onto the first
                // and `diffRegistry`'s Set reports no drift for a site nobody classified.
                const baseKey    = `${rel}#${symbol}:${expressionFingerprint(stripped.code)}`,
                      occurrence = seenKeys.get(baseKey) || 0;

                seenKeys.set(baseKey, occurrence + 1);

                candidates.push({
                    key    : occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`,
                    file   : rel,
                    line   : index + 1,
                    symbol,
                    pattern: hit.id,
                    retryContext,
                    snippet: line.trim().slice(0, 120)
                });
            });
        }
    }

    return candidates.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Resolves every repo-relative path a witness names.
 *
 * @summary Presence of a witness string is not evidence; a witness naming a spec that was deleted
 * two refactors ago reads exactly like a witness naming a live one, and the registry would keep
 * asserting a bound nobody can check. This is the difference between "someone typed a witness" and
 * "the witness resolves" — and only the second is worth a gate.
 *
 * Deliberately narrow: it resolves **paths**, because a path is mechanically checkable, and it does
 * not attempt to verify that a named symbol or clamp still exists inside the file. Those still rest
 * on review. Half a resolution beats none, and claiming more would be its own unwitnessed assertion.
 *
 * @param {String} key Registry key, for the message.
 * @param {String} witness The witness text.
 * @param {String} [rootDir] Repo root.
 * @returns {String[]} Problems; empty when every named path exists.
 */
export function unresolvedWitnessPaths(key, witness, rootDir = ROOT_DIR) {
    const refs     = witness.match(/\b(?:ai|src|apps|test|buildScripts|learn)\/[\w./-]*\.\w+(?:#[\w$]+)?/g) || [],
          problems = [];

    for (const ref of [...new Set(refs)]) {
        const [rel, symbol] = ref.split('#'),
              abs           = path.join(rootDir, rel);

        if (!fs.existsSync(abs)) {
            problems.push(`${key}: witness names ${rel}, which does not exist — a witness that cannot be resolved is not evidence.`);
            continue;
        }

        // An existing file plus a symbol that is not in it passed before: the path resolved, so the
        // witness looked checked. A renamed guard leaves exactly that shape, which is the case the
        // resolution exists to catch.
        if (symbol && !fs.readFileSync(abs, 'utf8').includes(symbol)) {
            problems.push(`${key}: witness names ${symbol} in ${rel}, which does not contain it — the cited proof does not resolve.`);
        }
    }

    return problems
}

/**
 * Validates one registry entry's shape.
 *
 * @summary A `retry-growth` entry must name lifetime AND carrier; a `not-a-retry` entry must not,
 * because a bound carrier for something that never retries is a claim nobody can witness. BOTH
 * require a witness — that requirement is what keeps this a classification registry rather than a
 * suppression allowlist.
 * @param {String} key Registry key.
 * @param {Object} entry Registry entry.
 * @returns {String[]} Problems; empty when valid.
 */
export function validateEntry(key, entry) {
    const problems = [];

    if (!VALID_KIND.has(entry?.kind)) {
        problems.push(`${key}: kind must be one of ${[...VALID_KIND].join(' | ')} (got ${JSON.stringify(entry?.kind)})`);
    }

    if (!entry?.witness || typeof entry.witness !== 'string' || entry.witness.trim().length === 0) {
        problems.push(`${key}: witness is required — name the spec or exported policy that PROVES the classification. An entry without one is a suppression, not a classification.`);
    } else {
        problems.push(...unresolvedWitnessPaths(key, entry.witness));
    }

    if (entry?.kind === 'retry-growth') {
        if (!VALID_LIFETIME.has(entry.lifetime)) {
            problems.push(`${key}: lifetime must be one of ${[...VALID_LIFETIME].join(' | ')} (got ${JSON.stringify(entry.lifetime)})`);
        }

        if (!VALID_CARRIER.has(entry.boundCarrier)) {
            problems.push(`${key}: boundCarrier must be one of ${[...VALID_CARRIER].join(' | ')} (got ${JSON.stringify(entry.boundCarrier)})`);
        }
    }

    if (entry?.kind === 'not-a-retry' && (entry.lifetime || entry.boundCarrier)) {
        problems.push(`${key}: a not-a-retry site must not declare lifetime/boundCarrier — there is no retry series to bound.`);
    }

    return problems;
}

/**
 * Diffs discovered candidates against the registry.
 *
 * @param {Object} options
 * @param {Object[]} options.candidates Discovered candidates.
 * @param {Object} options.registry Registry `sites` map.
 * @returns {{unclassified: Object[], uncontexted: Object[], stale: String[], invalid: String[]}}
 */
export function diffRegistry({candidates, registry}) {
    const discovered = new Set(candidates.map(c => c.key)),
          registered = Object.keys(registry),
          // Only retry-context candidates are REQUIRED to be classified. The rest are still
          // discovered, still reported, and may still be registered — they simply do not fail the
          // gate. Asking a canvas physics loop to declare a backoff cap is how a gate gets routed
          // around; hiding the loop entirely is how a real retry goes missing. The partition is the
          // only arrangement that refuses both.
          unclassified = candidates.filter(c => c.retryContext && !registry[c.key]),
          uncontexted  = candidates.filter(c => !c.retryContext && !registry[c.key]),
          stale        = registered.filter(key => !discovered.has(key)),
          invalid      = registered.flatMap(key => validateEntry(key, registry[key]));

    return {unclassified, uncontexted, stale, invalid};
}

/**
 * Loads the registry file.
 *
 * @param {String} [rootDir=ROOT_DIR] Repo root.
 * @returns {Object} The `sites` map.
 */
function loadRegistry(rootDir = ROOT_DIR) {
    const file = path.join(rootDir, REGISTRY_REL);

    if (!fs.existsSync(file)) {
        return {};
    }

    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed.sites || {};
}

/**
 * Runs the guard.
 *
 * @returns {{exitCode: Number}}
 */
export function runLint() {
    const candidates                                  = discoverCandidates(),
          registry                                    = loadRegistry(),
          {unclassified, uncontexted, stale, invalid} = diffRegistry({candidates, registry});

    // The census prints on EVERY run, pass or fail. It is the record of what was examined — the
    // property the partition must not cost. A growth expression outside retry vocabulary is visible
    // here, so a retry whose naming this gate cannot recognise is under a reader's eye rather than
    // silently absent, and can be registered deliberately if it turns out to be one.
    if (uncontexted.length > 0) {
        console.log(`[lint-retry-bounds] ${uncontexted.length} growth expression(s) outside retry vocabulary — reported, NOT gated:`);
        uncontexted.forEach(c => console.log(`  ${c.file}:${c.line}  ${c.snippet}`));
        console.log('  If one of these IS a retry, register it: the gate cannot see it by naming alone.\n');
    }

    if (unclassified.length === 0 && stale.length === 0 && invalid.length === 0) {
        console.log(`[lint-retry-bounds] ${candidates.length - uncontexted.length} retry-context candidate(s), all classified; ${uncontexted.length} reported ungated.`);
        return {exitCode: 0};
    }

    if (unclassified.length > 0) {
        console.error(`\n[lint-retry-bounds] ${unclassified.length} UNCLASSIFIED candidate(s) — this is not an assertion that they are unbounded:\n`);
        unclassified.forEach(c => {
            console.error(`  ${c.key}`);
            console.error(`      ${c.file}:${c.line}  (${c.pattern})  ${c.snippet}`);
        });
        console.error(`\n  Classify each in ${REGISTRY_REL}. If it is an easing curve, a random distribution, or any`);
        console.error('  other non-retry use of the same syntax, classify it as `not-a-retry` — with a witness. Do not');
        console.error('  narrow the discovery patterns to hide it: the record of what was examined is the point.\n');
    }

    if (stale.length > 0) {
        console.error(`[lint-retry-bounds] ${stale.length} STALE registry entr(ies) — the site is gone or its symbol was renamed:\n`);
        stale.forEach(key => console.error(`  ${key}`));
        console.error('');
    }

    if (invalid.length > 0) {
        console.error(`[lint-retry-bounds] ${invalid.length} INVALID registry entr(ies):\n`);
        invalid.forEach(problem => console.error(`  ${problem}`));
        console.error('');
    }

    return {exitCode: 1};
}

function main() {
    if (process.argv.includes('--list')) {
        discoverCandidates().forEach(c => console.log(`${c.key}\t${c.file}:${c.line}\t${c.pattern}\t${c.snippet}`));
        process.exit(0);
    }

    process.exit(runLint().exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}
