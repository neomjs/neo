#!/usr/bin/env node
/**
 * @summary Requires every member assigned in `initAsync()` to be read through *some* readiness
 * discipline — awaited readiness, or an accessor that converts absence into a typed error. A member
 * read through neither produces a raw `TypeError` naming no subsystem, during the startup window the
 * deferral itself opened.
 *
 * ## The invariant, and why it names TWO disciplines
 *
 * A member built in `initAsync()` is `null` between construction and readiness. Every reader of that
 * member silently acquired a new contract the moment the assignment moved out of `construct()`, and
 * nothing mechanical observes that move.
 *
 * The first draft of this predicate demanded one idiom — `await this.ready()` — and **fired on 58
 * sites**. Investigating the top offender falsified the predicate rather than the code:
 * `GraphService` uses `await this.ready()` **zero** times and is not thereby defective, because it
 * carries `requireDb()`, which converts absence into a typed unavailable-error instead of a
 * `TypeError`. That is a second, valid discipline, and a gate's first large number more often indicts
 * the gate than the tree.
 *
 * So the invariant is not "await readiness". It is:
 *
 * > A member built in `initAsync()` must be read through **awaited readiness** or through **a guard
 * > that converts absence into a typed error**. Reading it through neither is the defect.
 *
 * ## Why the typed-guard discipline is recognised at FILE level, not per read
 *
 * This is the single most consequential decision in this file, so it is stated rather than buried.
 *
 * `GraphService` defines `requireDb()` once and reads `this.db` **124 times without calling it** —
 * the accessor exists for its *consumers*, which call `GraphService.requireDb(surface)` from 23 sites
 * in other files. A per-read rule would therefore flag the very file the acceptance criteria name as
 * the green case, 124 times over.
 *
 * The rule is consequently: **a member is disciplined if its file defines a typed-error accessor for
 * it.** The invariant is that the member *has* a discipline, not that every read re-proves it.
 * Whether each internal read routes through the accessor is a weaker, separate question, and one this
 * predicate deliberately does not answer — see the bounds below.
 *
 * ## What this reports, and what it does NOT
 *
 * A violation here is a **defect claim**, not an `unclassified` note. That differs from its sibling
 * `lint-retry-bounds`, which never says "unbounded" because its discovery patterns have a larger
 * false-positive family than true-positive set. This population is narrower and derived rather than
 * inferred: a member either is or is not assigned in `initAsync()`, read from the syntax tree of that
 * one method. The registry therefore records *accepted* sites with a reason — it is not a place to
 * absorb false positives.
 *
 * **Bounds — what a green run does not establish:**
 *
 * - **Per file only.** A member of `ServiceA` read by `ServiceB` is invisible here. No cross-file or
 *   cross-instance following.
 * - **Textual order, not branch dominance.** `await this.ready()` counts when it appears earlier in
 *   the same method. A `ready()` awaited inside one arm of a conditional reads as covering the whole
 *   method, and a read in a callback defined above its own `await` reads as uncovered.
 * - **No call-graph following.** A method that delegates to a private helper which awaits readiness
 *   is not credited. The accessor's *existence* is checked; its *use* is not.
 * - **Assignment detection is syntactic.** `Object.assign(this, {...})` or a computed
 *   `this[name] = …` inside `initAsync()` does not register a deferred member.
 *
 * ## Shapes, because "unguarded" hides two very different risks
 *
 * The report distinguishes how a read fails the invariant, because the consequences diverge:
 *
 * | shape | what happens during the window |
 * |---|---|
 * | `bare-read` | `TypeError: Cannot read properties of null` — loud, names no subsystem |
 * | `truthy-skip` | `if (this.member)` — the work is **silently skipped** and the caller is told nothing |
 * | `optional-chain` | `this.member?.x` — evaluates `undefined` and flows on |
 *
 * `truthy-skip` is the one worth arguing about, and it is deliberately a violation rather than a
 * third discipline: it does not convert absence into a typed error, it converts it into *silence*.
 * `SessionService.purgeSession()` is the worked example — it returns `{success: true,
 * deletedMemories: 0, deletedSummaries: 0}` when the collections are absent, which the caller cannot
 * distinguish from a genuinely empty session, after the WAL tombstone pass above it has already run
 * unconditionally.
 *
 * ## Scope
 *
 * Production `.mjs` under `ai/`, `src/`, `apps/`, `buildScripts/`. Specs and tests are excluded: a
 * fixture asserting startup behaviour is not a production read site.
 */

import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    ROOT_DIR     = path.resolve(__dirname, '../../../'),
    REGISTRY_REL = 'ai/scripts/lint/deferred-member-registry.json',
    SCAN_ROOTS   = ['ai', 'src', 'apps', 'buildScripts'],

    SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'test', 'tests', 'coverage']),

    VALID_SHAPE = new Set(['bare-read', 'truthy-skip', 'optional-chain']),

    /**
     * The committed registry, unless a spec points this at a fixture.
     *
     * A red-proof that mutated the real registry would leave the repo dirty on failure and could not
     * run in parallel. Production never sets this.
     */
    REGISTRY_PATH = process.env.NEO_DEFERRED_MEMBER_REGISTRY
        ? path.resolve(process.env.NEO_DEFERRED_MEMBER_REGISTRY)
        : path.join(ROOT_DIR, REGISTRY_REL);

/**
 * @summary Every surface whose contents can change this lint's verdict — the SSOT its CI workflow's
 * path filter must cover.
 *
 * Exported so the `scanned ⊆ watched` spec takes it as authority rather than a hand-copied duplicate:
 * adding a scan root widens this array in the same edit, and an unwidened workflow filter then fails
 * that spec without anyone remembering a registry exists. The walker skips test directories, so the
 * root globs are a deliberate superset of what is actually read — a superset never under-watches.
 *
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    ...SCAN_ROOTS.map(root => `${root}/**/*.mjs`),
    REGISTRY_REL
]);

/**
 * Whether a source line is code rather than comment prose.
 *
 * @summary Excluded by SHAPE, not keyword: a JSDoc table describing `this.db` is not a read. Block
 * state is carried because a `*`-prefixed continuation is indistinguishable from code read alone.
 * @param {String} line Raw source line.
 * @param {Boolean} inBlockComment Whether the scanner is inside a block comment.
 * @returns {{isCode: Boolean, inBlockComment: Boolean}}
 */
export function classifyLine(line, inBlockComment) {
    const trimmed = line.trim();

    if (inBlockComment) {
        return {isCode: false, inBlockComment: !trimmed.includes('*/')}
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        return {isCode: false, inBlockComment: false}
    }

    if (trimmed.startsWith('/*')) {
        return {isCode: false, inBlockComment: !trimmed.includes('*/')}
    }

    return {isCode: true, inBlockComment: false}
}

/**
 * Resolves every method's line range by brace depth.
 *
 * @summary Ranges rather than "nearest declaration above" because this predicate has to answer
 * *containment* questions — is this read inside `initAsync`, is this `await ready()` in the same
 * method — and a backwards scan cannot tell a sibling method from an enclosing one.
 *
 * Control-flow keywords are excluded so `if (x) {` does not register as a method named `if`.
 * @param {String[]} lines All source lines.
 * @returns {Object[]} `[{name, start, end}]`, zero-based inclusive line indices.
 */
export function findMethodRanges(lines) {
    const
        // The parameter list is matched GREEDILY to the last `)` on the line, and the line must END at
        // the opening brace.
        //
        // The first revision used `\([^)]*\)`, which stops at the FIRST `)` — so any method with a call
        // in a default parameter value was invisible. That silently dropped
        // `SessionService.findSessionsToSummarize({now = Date.now()} = {})`, which is the exact site
        // this ticket's acceptance criteria name as the red case: the lint ran clean on the defect it
        // was written to catch. Caught only by checking the output against the named case rather than
        // against the total.
        DECL     = /^\s*(?:static\s+)?(?:async\s+)?(#?[A-Za-z_$][\w$]*)\s*\(.*\)\s*\{\s*$/,
        KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function']),
        ranges   = [];

    let inBlockComment = false,
        open           = null,
        depth          = 0;

    lines.forEach((line, index) => {
        const state = classifyLine(line, inBlockComment);

        inBlockComment = state.inBlockComment;

        if (!state.isCode) {
            return
        }

        const match = line.match(DECL);

        if (!open && match && !KEYWORDS.has(match[1])) {
            open  = {name: match[1], start: index};
            depth = 0;
        }

        if (open) {
            depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

            if (depth <= 0) {
                ranges.push({...open, end: index});
                open = null;
            }
        }
    });

    // An unterminated method (parse skew) still gets a range to the end of file rather than vanishing,
    // because a silently dropped method is a silently dropped population.
    open && ranges.push({...open, end: lines.length - 1});

    return ranges
}

/**
 * @param {Object[]} ranges From `findMethodRanges`.
 * @param {Number} index Zero-based line index.
 * @returns {Object|null} The innermost range containing `index`.
 */
export function methodAt(ranges, index) {
    return ranges.filter(r => index >= r.start && index <= r.end).sort((a, b) => (b.start - a.start))[0] || null
}

/**
 * Members assigned inside `initAsync()`.
 *
 * @summary **The population is derived here, from the assignment — never from a member name.** The
 * defect this lint replaces was caused by a hand-written query that shaped its own population: the
 * readers were found by grepping the external form (`ChromaManager.client`), so every internal
 * `this.client` read was invisible to a search intended to be exhaustive.
 * @param {String[]} lines All source lines.
 * @param {Object[]} ranges From `findMethodRanges`.
 * @returns {Set<String>} Member names.
 */
export function deferredMembersOf(lines, ranges) {
    const members = new Set(),
          init    = ranges.find(r => r.name === 'initAsync');

    if (!init) {
        return members
    }

    let inBlockComment = false;

    for (let i = init.start; i <= init.end; i++) {
        const state = classifyLine(lines[i], inBlockComment);

        inBlockComment = state.inBlockComment;

        if (!state.isCode) {
            continue
        }

        // `=` but not `==`/`===`/`=>`, so a comparison or an arrow is not read as an assignment.
        const match = lines[i].match(/^\s*this\.([A-Za-z_$][\w$]*)\s*=(?![=>])/);

        match && members.add(match[1])
    }

    return members
}

/**
 * Members for which the file defines a typed-error accessor.
 *
 * @summary The `requireDb()` discipline: a method that tests the member's absence and throws. Both
 * the `throw` and the test must sit in the same method, so a method that merely mentions the member
 * near an unrelated `throw` does not qualify.
 *
 * Recognised at file level by deliberate design — see the header. `GraphService` defines `requireDb()`
 * once and reads `this.db` 124 times without it; the accessor exists for its 23 external callers.
 * @param {String[]} lines All source lines.
 * @param {Object[]} ranges From `findMethodRanges`.
 * @returns {Map<String, String>} member → accessor method name.
 */
export function typedGuardMembers(lines, ranges) {
    const guards = new Map();

    for (const range of ranges) {
        const body = lines.slice(range.start, range.end + 1).join('\n');

        if (!/\bthrow\b/.test(body)) {
            continue
        }

        for (const match of body.matchAll(/if\s*\(\s*!\s*this\.([A-Za-z_$][\w$]*)\s*\)/g)) {
            !guards.has(match[1]) && guards.set(match[1], range.name)
        }
    }

    return guards
}

/**
 * Classifies how a read fails the invariant.
 *
 * @param {String} line The read's source line.
 * @param {String} methodBody The enclosing method's full text.
 * @param {String} member Member name.
 * @returns {String} One of `VALID_SHAPE`.
 */
export function readShape(line, methodBody, member) {
    // A truthiness test ANYWHERE in the method: the read is reachable only when the member exists, so
    // the failure is silence rather than a throw.
    //
    // Deliberately not anchored to `if (this.x)`. The first revision required the member immediately
    // after `if (`, and misread `if (!config.toolTelemetry.enabled || !this.db) return null;` as a
    // bare read — a guarded site reported as a crash risk. A guard is a guard wherever it sits in the
    // condition, and `this.x && …` guards without an `if` at all.
    if (new RegExp(`(if\\s*\\(.*\\bthis\\.${member}\\b|\\bthis\\.${member}\\s*&&)`).test(methodBody)) {
        return 'truthy-skip'
    }

    if (new RegExp(`this\\.${member}\\s*\\?\\.`).test(line)) {
        return 'optional-chain'
    }

    return 'bare-read'
}

/**
 * Whether a line is only the guard's own test rather than a use of the member.
 *
 * @summary `if (!this.db) return;` is the discipline being applied, not a read that needs one.
 * Reporting it as the violation's location sends the reader to the line that is already handling the
 * case. Used to choose which line to cite, never to decide whether a site is a violation.
 * @param {String} line Raw source line.
 * @param {String} member Member name.
 * @returns {Boolean}
 */
export function isGuardTestLine(line, member) {
    const trimmed = line.trim();

    return new RegExp(`^\\}?\\s*(else\\s+)?if\\s*\\(.*\\bthis\\.${member}\\b`).test(trimmed) &&
           !new RegExp(`this\\.${member}\\s*[.\\[]`).test(trimmed)
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
        entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch (error) {
        return acc
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            !SKIP_DIR.has(entry.name) && collectSourceFiles(full, acc)
        } else if (entry.isFile() && entry.name.endsWith('.mjs') && !/\.spec\.mjs$/.test(entry.name)) {
            acc.push(full)
        }
    }

    return acc
}

/**
 * Finds every undisciplined read of a deferred member.
 *
 * @param {Object} [options]
 * @param {String} [options.rootDir=ROOT_DIR] Repo root.
 * @returns {Object[]} `[{key, file, line, method, member, shape, snippet}]`, sorted by key.
 */
export function discoverViolations({rootDir = ROOT_DIR} = {}) {
    const seenKeys = new Map();

    for (const root of SCAN_ROOTS) {
        for (const file of collectSourceFiles(path.join(rootDir, root))) {
            const
                rel     = path.relative(rootDir, file),
                lines   = fs.readFileSync(file, 'utf8').split('\n'),
                ranges  = findMethodRanges(lines),
                members = deferredMembersOf(lines, ranges);

            if (members.size === 0) {
                continue
            }

            const
                guarded = typedGuardMembers(lines, ranges),
                init    = ranges.find(r => r.name === 'initAsync');

            let inBlockComment = false;

            lines.forEach((line, index) => {
                const state = classifyLine(line, inBlockComment);

                inBlockComment = state.inBlockComment;

                if (!state.isCode || (init && index >= init.start && index <= init.end)) {
                    return
                }

                for (const member of members) {
                    // The member's file carries a typed-error accessor: the member HAS a discipline.
                    if (guarded.has(member)) {
                        continue
                    }

                    // A read, not a write. `this.x =` is the assignment; `this.x ==` is a comparison.
                    if (!new RegExp(`this\\.${member}\\b(?!\\s*=(?![=>]))`).test(line)) {
                        continue
                    }

                    const enclosing = methodAt(ranges, index);

                    if (!enclosing) {
                        continue
                    }

                    const body = lines.slice(enclosing.start, index + 1).join('\n');

                    // Discipline A — awaited readiness, textually before the read in this method.
                    if (/await\s+this\.ready\s*\(/.test(body)) {
                        continue
                    }

                    // ONE obligation per (file, method, member) — not per read.
                    //
                    // `lint-retry-bounds` appends an occurrence ordinal because two growth expressions
                    // in one symbol are two distinct bounds. Here they are not: eleven reads of
                    // `this.db` inside `admitBatch` are all fixed by the same single discipline, and
                    // eleven registry rows would be eleven copies of one decision — churning on every
                    // unrelated edit and burying the eleven DIFFERENT decisions elsewhere in the file.
                    //
                    // Collapsing also removes an artifact of counting reads: the guard's own test line
                    // (`if (!this.db) return;`) was reported as a separate violation from the read it
                    // protects.
                    const
                        methodBody = lines.slice(enclosing.start, enclosing.end + 1).join('\n'),
                        key        = `${rel}#${enclosing.name}:${member}`,
                        existing   = seenKeys.get(key);

                    if (existing) {
                        existing.reads++;

                        // Prefer citing a line that USES the member over the guard that tests it.
                        if (existing.citedGuard && !isGuardTestLine(line, member)) {
                            existing.line       = index + 1;
                            existing.snippet    = line.trim().slice(0, 110);
                            existing.citedGuard = false
                        }

                        continue
                    }

                    seenKeys.set(key, {
                        key,
                        file      : rel,
                        line      : index + 1,
                        method    : enclosing.name,
                        member,
                        reads     : 1,
                        shape     : readShape(line, methodBody, member),
                        snippet   : line.trim().slice(0, 110),
                        citedGuard: isGuardTestLine(line, member)
                    })
                }
            })
        }
    }

    return [...seenKeys.values()]
        .map(({citedGuard, ...violation}) => violation)
        .sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Resolves every repo-relative path a witness names.
 *
 * @summary Presence of a witness string is not evidence; a witness naming a file deleted two
 * refactors ago reads exactly like one naming a live file. Deliberately narrow — it resolves paths,
 * which are mechanically checkable, and does not claim the cited reasoning still holds.
 * @param {String} key Registry key, for the message.
 * @param {String} witness The witness text.
 * @param {String} [rootDir=ROOT_DIR] Repo root.
 * @returns {String[]} Problems; empty when every named path exists.
 */
export function unresolvedWitnessPaths(key, witness, rootDir = ROOT_DIR) {
    const refs     = witness.match(/\b(?:ai|src|apps|test|buildScripts|learn)\/[\w./-]*\.\w+/g) || [],
          problems = [];

    for (const ref of [...new Set(refs)]) {
        fs.existsSync(path.join(rootDir, ref)) ||
            problems.push(`${key}: witness names ${ref}, which does not exist — a witness that cannot be resolved is not evidence.`)
    }

    return problems
}

/**
 * Validates one registry entry.
 *
 * @summary BOTH a reason and a witness are required. That requirement is what keeps this an
 * acceptance registry rather than a suppression allowlist.
 * @param {String} key Registry key.
 * @param {Object} entry Registry entry.
 * @returns {String[]} Problems; empty when valid.
 */
export function validateEntry(key, entry) {
    const problems = [];

    if (!VALID_SHAPE.has(entry?.shape)) {
        problems.push(`${key}: shape must be one of ${[...VALID_SHAPE].join(' | ')} (got ${JSON.stringify(entry?.shape)})`)
    }

    if (!entry?.reason || typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
        problems.push(`${key}: reason is required — say WHY this read is accepted. An entry without one is a suppression, not an acceptance.`)
    }

    if (!entry?.witness || typeof entry.witness !== 'string' || entry.witness.trim().length === 0) {
        problems.push(`${key}: witness is required — name the code or spec that makes the acceptance checkable.`)
    } else {
        problems.push(...unresolvedWitnessPaths(key, entry.witness))
    }

    return problems
}

/**
 * Diffs discovered violations against the registry.
 *
 * @param {Object} options
 * @param {Object[]} options.violations Discovered violations.
 * @param {Object} options.registry Registry `sites` map.
 * @returns {{unregistered: Object[], stale: String[], invalid: String[], drifted: String[]}}
 */
export function diffRegistry({violations, registry}) {
    const
        discovered   = new Map(violations.map(v => [v.key, v])),
        registered   = Object.keys(registry),
        unregistered = violations.filter(v => !registry[v.key]),
        stale        = registered.filter(key => !discovered.has(key)),
        invalid      = registered.flatMap(key => validateEntry(key, registry[key])),

        // A registered site whose SHAPE changed is not the site that was accepted. A `truthy-skip`
        // becoming a `bare-read` turns silent skipping into a crash, and the old reason no longer
        // describes it.
        drifted = registered
            .filter(key => discovered.has(key) && discovered.get(key).shape !== registry[key]?.shape)
            .map(key => `${key}: registered as ${registry[key].shape}, now ${discovered.get(key).shape} — re-examine and re-accept.`);

    return {unregistered, stale, invalid, drifted}
}

/**
 * The registry ratchet: it may shrink freely and may not grow silently.
 *
 * @summary Asserting EQUALITY would be the obvious check and the wrong one — it would fail the moment
 * someone gives a site a discipline and removes its entry, i.e. it would block the shrinkage this
 * registry exists to enable. `baselineAtIntroduction` is a historical high-water mark, not a current
 * count.
 *
 * Enforced rather than documented, because a number no predicate checks is a census.
 * @param {Object} options
 * @param {Number} options.accepted Current entry count.
 * @param {Number} [options.baseline] `baselineAtIntroduction`, when set.
 * @returns {String[]} Problems; empty when the ratchet holds or no baseline is declared.
 */
export function registryGrowthProblems({accepted, baseline}) {
    if (!Number.isInteger(baseline) || accepted <= baseline) {
        return []
    }

    return [
        `the registry GREW: ${accepted} accepted entries against a baseline of ${baseline}. Accepting a ` +
        'new undisciplined read is a deliberate act — add a discipline instead, or raise ' +
        '`baselineAtIntroduction` in the same commit with the reason in the PR body.'
    ]
}

/**
 * @param {String} [registryPath=REGISTRY_PATH]
 * @returns {Object} `{sites, baselineAtIntroduction}`
 */
function loadRegistry(registryPath = REGISTRY_PATH) {
    if (!fs.existsSync(registryPath)) {
        return {sites: {}}
    }

    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    return {sites: parsed.sites || {}, baseline: parsed.$schema?.baselineAtIntroduction}
}

/**
 * Runs the guard.
 *
 * @returns {{exitCode: Number}}
 */
export function runLint() {
    const
        violations                              = discoverViolations(),
        {sites, baseline}                       = loadRegistry(),
        {unregistered, stale, invalid, drifted} = diffRegistry({violations, registry: sites}),
        accepted                                = Object.keys(sites).length;

    invalid.push(...registryGrowthProblems({accepted, baseline}));

    if (unregistered.length === 0 && stale.length === 0 && invalid.length === 0 && drifted.length === 0) {
        console.log(`[lint-deferred-member-readiness] OK (${violations.length} undisciplined read(s), all accepted; baseline ${baseline ?? 'unset'})`);
        return {exitCode: 0}
    }

    console.error('[lint-deferred-member-readiness] FAILED');

    if (unregistered.length) {
        console.error(`\n  ${unregistered.length} deferred member(s) read through NEITHER readiness discipline:\n`);

        unregistered.forEach(v => {
            console.error(`    ${v.key}   [${v.shape}]`);
            console.error(`        ${v.file}:${v.line}  ${v.snippet}`)
        });

        console.error('\n  A member assigned in initAsync() is null until readiness. Give it a discipline —');
        console.error('  `await this.ready()` before the read, or an accessor that throws a typed error on absence');
        console.error(`  (see GraphService.requireDb) — or record it in ${REGISTRY_REL} with a reason and a witness.\n`)
    }

    if (drifted.length) {
        console.error(`  ${drifted.length} DRIFTED entr(ies) — the accepted read changed shape:\n`);
        drifted.forEach(problem => console.error(`    ${problem}`));
        console.error('')
    }

    if (stale.length) {
        console.error(`  ${stale.length} STALE registry entr(ies) — the read is gone, or its method/member was renamed:\n`);
        stale.forEach(key => console.error(`    ${key}`));
        console.error('\n  The registry must shrink visibly. A stale entry silently widens the accepted set.\n')
    }

    if (invalid.length) {
        console.error(`  ${invalid.length} INVALID registry entr(ies):\n`);
        invalid.forEach(problem => console.error(`    ${problem}`));
        console.error('')
    }

    return {exitCode: 1}
}

function main() {
    if (process.argv.includes('--list')) {
        discoverViolations().forEach(v => console.log(`${v.key}\t${v.shape}\t${v.file}:${v.line}\t${v.snippet}`));
        process.exit(0)
    }

    process.exit(runLint().exitCode)
}

// Import-safe, per the house pattern in `lint-retry-bounds.mjs` and `lint-guard-ci-parity.mjs`: the
// `scanned ⊆ watched` spec imports SCAN_SURFACE from this module, and a bare `process.exit()` at
// module scope would terminate the test process on import.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main()
}
