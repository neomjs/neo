import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../..');

// The core.Base lifecycle contract (src/core/Base.mjs): construct() auto-fires initAsync()
// exactly once; external consumers await ready(). An external initAsync() call double-executes
// the override ("fatal duplication bugs" per the Base warning), and a `_initPromise` reach-in
// is a private duplication of the #readyPromise lifecycle that shatters when init internals
// change. This guard freezes the production trees at zero for both patterns.
//
// Scope: src/ + ai/ (the production tranche). test/ joins once the singleton re-init seam
// lands and the spec tranche migrates — extending SCAN_ROOTS is that ticket's one-line change.
const SCAN_ROOTS = ['src', 'ai'];

// The contract's home defines the lifecycle and legitimately contains the framework-internal
// fire (`await me.initAsync()` inside construct) plus the warning-comment example.
const EXEMPT_FILES = new Set(['src/core/Base.mjs']);

// Call-anchored, not await-anchored: thunks and passed references (`start: () => X.initAsync()`)
// are the same double-run bug without an `await` keyword in front. Syntax-tolerant: optional
// chaining (`.initAsync?.()`) and whitespace variants evaded the first, exact-literal shape of
// this pattern — the fixture self-test below pins every variant permanently.
const EXTERNAL_INIT_CALL = /(?<!super)\.initAsync\s*(\?\.)?\s*\(/;

// Any `X._initPromise` where X is not `this`: reads, writes, and null-resets are all reach-ins.
// Owner-internal `this._initPromise` stays legal until the bespoke guards are deleted.
const INIT_PROMISE_REACH_IN = /(?<!this)\._initPromise/;

// The permanent regex falsifiers: every syntax variant that MUST flag, and every legitimate
// form that MUST pass. A future pattern change that un-catches a variant fails here — the
// tree can be at zero while the regex is wrong, and this is the test that knows.
const MUST_FLAG = [
    'await GraphService.initAsync()',
    'await client.initAsync?.()',
    'start: () => RecorderService.initAsync(),',
    'await service.initAsync ()',
    'await service.initAsync?. ()',
    'if (LifecycleService._initPromise) {',
    'await LifecycleService._initPromise;',
    'GraphService._initPromise = null;',
    'if (service?._initPromise) {'
];

const MUST_PASS = [
    'await super.initAsync();',
    'async initAsync() {',
    '// await myInstance.initAsync() would double-run the boot',
    ' * Calling it externally (e.g. `await myInstance.initAsync()`) duplicates init.',
    'await this._initPromise;',
    'this._initPromise = (async () => {'
];

/**
 * @summary Recursively collects .mjs files under a root, skipping build/dependency output.
 * @param {String} dir
 * @param {String[]} bucket
 * @returns {String[]}
 */
function collectMjsFiles(dir, bucket = []) {
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
    // definitions (`async initAsync()`) and `super.initAsync()` chains are the contract,
    // not violations; comment prose is documentation
    if (isCommentLine(line) || line.includes('async initAsync(')) {
        return null
    }

    if (EXTERNAL_INIT_CALL.test(line)) {
        return 'external-initAsync'
    }

    if (INIT_PROMISE_REACH_IN.test(line)) {
        return 'initPromise-reach-in'
    }

    return null
}

/**
 * @summary Scans the production trees for violations of one label class.
 * @param {String} label
 * @returns {String[]} `file:line: source` entries
 */
function scanFor(label) {
    const violations = [];

    for (const root of SCAN_ROOTS) {
        for (const file of collectMjsFiles(path.join(repoRoot, root))) {
            const relative = path.relative(repoRoot, file);

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

test.describe('core.Base init/ready contract guard (production trees)', () => {
    test('no external initAsync() call sites exist in src/ or ai/', () => {
        const violations = scanFor('external-initAsync');

        expect(violations,
            'External initAsync() calls double-execute init ("fatal duplication bugs" — src/core/Base.mjs warning). ' +
            'Await the instance\'s ready() instead:\n' + violations.join('\n')
        ).toEqual([])
    });

    test('no _initPromise reach-ins exist in src/ or ai/', () => {
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
});
