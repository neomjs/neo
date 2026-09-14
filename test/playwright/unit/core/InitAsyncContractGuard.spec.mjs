import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../..');

/**
 * @summary Freezes the `core.Base` init/ready contract at zero violations across every tree that
 * can hold one.
 *
 * The contract (`src/core/Base.mjs:601-606`, `:956-960`): `construct()` auto-fires `initAsync()`
 * exactly once, and external consumers await `ready()`. Calling `initAsync()` externally executes
 * the override a second time — "fatal duplication bugs" in Base's own words, including a repeated
 * `initRemote()` registration for `remote`-bearing classes. A `X._initPromise` reach-in is a
 * private duplication of the `#readyPromise` lifecycle that shatters whenever init internals move.
 *
 * ## Why this file exists twice
 *
 * It is a restoration, not a new idea. The original shipped with the production sweep that drove
 * external `initAsync()` calls to zero, and it did its job from
 * `test/playwright/unit/ai/InitAsyncContractGuard.spec.mjs`. It was then deleted by `c623b2f63c` —
 * not as a decision about the guard, but as collateral of removing the received Brain
 * implementation, which took the whole `ai/` tree including this file. The debt stayed at zero;
 * the thing keeping it there did not.
 *
 * That is the failure mode worth naming: a guard removed with the directory it happened to live in
 * looks exactly like a guard nobody ever built. Nothing reported the loss, because a guard's
 * absence is silent by construction.
 *
 * ## Why it now scans more than the original did
 *
 * The original scanned `['src', 'ai']` and deferred `test/` with the comment *"test/ joins once the
 * singleton re-init seam lands"*. That seam was **rejected**, on the ruling that `initAsync()` is a
 * one-shot continuation of construction and not a restart hook. So the spec-side
 * `X._initPromise = null; await X.initAsync()` reset idiom has no sanctioned future, which makes
 * guarding `test/` more valuable than when it was deferred, not less. Every root below was measured at zero before this landed, so the guard freezes a clean
 * tree rather than arriving with a backlog.
 *
 * ## Why it exempts itself
 *
 * `MUST_FLAG` holds the anti-patterns as string literals on code lines, so once this file lives
 * under a scanned root it flags itself. Skipping it costs nothing that matters: the classifier is
 * not taken on trust, it is pinned by those very fixtures in the third arm — which is the arm that
 * fails when the PATTERN regresses, independently of what the tree currently contains.
 */

// Every tree that can hold a violation. `ai` is gone (`c623b2f63c`); `test` is in because the
// re-init seam that would have justified its idiom was rejected — see the docblock.
const SCAN_ROOTS = ['src', 'apps', 'buildScripts', 'examples', 'test'];

// The contract's home legitimately contains the framework-internal fire (`await me.initAsync()`
// inside `construct`) and the warning-comment example. This guard's own fixtures are literals of
// the anti-patterns it hunts.
const EXEMPT_FILES = new Set([
    'src/core/Base.mjs',
    'test/playwright/unit/core/InitAsyncContractGuard.spec.mjs'
]);

// Call-anchored, not await-anchored: thunks and passed references (`start: () => X.initAsync()`)
// are the same double-run bug without an `await` keyword in front. Syntax-tolerant: optional
// chaining (`.initAsync?.()`) and whitespace variants evaded the first, exact-literal shape of
// this pattern — the fixture self-test below pins every variant permanently.
//
// The receiver exemption is a TOKEN, not a suffix. A bare `(?<!super)` recognises any identifier
// ENDING in those characters, so `mysuper.initAsync()` — an ordinary external call on an unrelated
// object — read as the legitimate `super` chain and passed. The inner `(?<![$\w])` demands a token
// boundary before the keyword, so only the real receiver is exempt.
const EXTERNAL_INIT_CALL = /(?<!(?<![$\w])super)\.initAsync\s*(\?\.)?\s*\(/;

// Any `X._initPromise` where X is not `this`: reads, writes, and null-resets are all reach-ins.
// Same token-boundary requirement — `notthis._initPromise` is not owner-internal access.
const INIT_PROMISE_REACH_IN = /(?<!(?<![$\w])this)\._initPromise/;

// The declaration form itself. Removed from a line before classification rather than exempting the
// whole line — see `violationLabel`. Global, so it is only ever used with `replace`, never `test`.
const DECLARATION = /async\s+initAsync\s*\([^)]*\)/g;

// The permanent regex falsifiers: every syntax variant that MUST flag, and every legitimate form
// that MUST pass. A future pattern change that un-catches a variant fails here — the tree can be
// at zero while the regex is wrong, and this is the test that knows.
const MUST_FLAG = [
    'await GraphService.initAsync()',
    'await client.initAsync?.()',
    'start: () => RecorderService.initAsync(),',
    'await service.initAsync ()',
    'await service.initAsync?. ()',
    'if (LifecycleService._initPromise) {',
    'await LifecycleService._initPromise;',
    'GraphService._initPromise = null;',
    'if (service?._initPromise) {',
    // Forbidden operations sharing a line with legitimate syntax. A clean corpus cannot falsify an
    // EXEMPTION — only a case that sits inside one can, which is why these are fixtures and not a
    // tree scan. Supplied by a reviewer probe run against the classifier's exact head.
    'async initAsync() { await service.initAsync(); }',
    'async initAsync() { await service._initPromise; }',
    // Identifiers that merely END in the exempt receiver's characters.
    'await mysuper.initAsync();',
    'await notthis._initPromise;'
];

const MUST_PASS = [
    'await super.initAsync();',
    'async initAsync() {',
    '// await myInstance.initAsync() would double-run the boot',
    ' * Calling it externally (e.g. `await myInstance.initAsync()`) duplicates init.',
    'await this._initPromise;',
    'this._initPromise = (async () => {',
    // The legitimate counterpart of the two combined-line flags above: a declaration whose body
    // carries only the sanctioned `super` chain must stay clean, or the repair would have traded
    // a blind spot for a false positive on the one form the contract requires.
    'async initAsync() { await super.initAsync(); }'
];

/**
 * @summary Recursively collects .mjs files under a root, skipping build/dependency output.
 * @param {String} dir
 * @param {String[]} bucket
 * @returns {String[]}
 */
function collectMjsFiles(dir, bucket = []) {
    if (!fs.existsSync(dir)) {
        return bucket
    }

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
            continue
        }

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            collectMjsFiles(full, bucket)
        } else if (entry.name.endsWith('.mjs')) {
            bucket.push(full)
        }
    }

    return bucket
}

/**
 * @summary Comment lines may cite the anti-pattern as prose (the Base warning does); only code
 * lines count as violations.
 * @param {String} line
 * @returns {Boolean}
 */
function isCommentLine(line) {
    const trimmed = line.trim();

    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/**
 * @summary The single line classifier BOTH the tree scan and the fixture self-test run through —
 * one code path, so the fixtures genuinely falsify what the scan executes.
 * @param {String} line
 * @returns {String|null} 'external-initAsync' | 'initPromise-reach-in' | null
 */
function violationLabel(line) {
    // comment prose is documentation — Base's own warning cites the anti-pattern verbatim
    if (isCommentLine(line)) {
        return null
    }

    // A declaration is the contract, so it is REMOVED from the line rather than exempting the line.
    // The whole-line exemption this replaces read `line.includes('async initAsync(')` and therefore
    // waved through `async initAsync() { await service.initAsync(); }` — the declaration made the
    // line legitimate while a separate external call sat on it, which is the operation the guard
    // exists to catch. Stripping keeps a bare declaration passing and leaves everything else on the
    // line visible to the patterns.
    const code = line.replace(DECLARATION, '');

    if (EXTERNAL_INIT_CALL.test(code)) {
        return 'external-initAsync'
    }

    if (INIT_PROMISE_REACH_IN.test(code)) {
        return 'initPromise-reach-in'
    }

    return null
}

/**
 * @summary Scans every root for violations of one label class.
 * @param {String} label
 * @returns {String[]} `file:line [label]: source` entries
 */
function scanFor(label) {
    const violations = [];

    for (const root of SCAN_ROOTS) {
        for (const file of collectMjsFiles(path.join(repoRoot, root))) {
            const relative = path.relative(repoRoot, file).replaceAll('\\', '/');

            if (EXEMPT_FILES.has(relative)) {
                continue
            }

            fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
                if (violationLabel(line) === label) {
                    violations.push(`${relative}:${index + 1} [${label}]: ${line.trim()}`)
                }
            })
        }
    }

    return violations
}

test.describe('core.Base init/ready contract guard', () => {
    test('no external initAsync() call sites exist in any scanned tree', () => {
        const violations = scanFor('external-initAsync');

        expect(violations,
            'External initAsync() calls double-execute init ("fatal duplication bugs" — src/core/Base.mjs warning). ' +
            'Await the instance\'s ready() instead:\n' + violations.join('\n')
        ).toEqual([])
    });

    test('no _initPromise reach-ins exist in any scanned tree', () => {
        const violations = scanFor('initPromise-reach-in');

        expect(violations,
            '`X._initPromise` is a private lifecycle duplication — ready()/isReady are the contract surface. ' +
            'Await the instance\'s ready() instead:\n' + violations.join('\n')
        ).toEqual([])
    });

    test('the classifier itself is pinned: every syntax variant flags, every legitimate form passes', () => {
        // a green tree scan through a too-narrow regex is a false zero — this is the test
        // that fails when the PATTERN regresses, independent of tree state
        for (const line of MUST_FLAG) {
            expect(violationLabel(line), `must flag but passed: ${line}`).not.toBeNull()
        }

        for (const line of MUST_PASS) {
            expect(violationLabel(line), `must pass but flagged: ${line}`).toBeNull()
        }
    });

    test('every scan root exists — a root that silently vanished is a guard that stopped guarding', () => {
        // The failure this file is a restoration OF: `ai/` left with the Brain implementation and
        // took the original guard with it. A root removed from the tree without being removed here
        // would otherwise scan nothing and stay green, which is indistinguishable from clean.
        const missing = SCAN_ROOTS.filter(root => !fs.existsSync(path.join(repoRoot, root)));

        expect(missing,
            `scan root(s) named here no longer exist: ${missing.join(', ')}. ` +
            'Remove them deliberately, or the guard is measuring an absence.'
        ).toEqual([])
    })
});
