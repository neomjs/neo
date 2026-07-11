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
// are the same double-run bug without an `await` keyword in front.
const EXTERNAL_INIT_CALL = /(?<!super)\.initAsync\(\)/;

// Any `X._initPromise` where X is not `this`: reads, writes, and null-resets are all reach-ins.
// Owner-internal `this._initPromise` stays legal until the bespoke guards are deleted.
const INIT_PROMISE_REACH_IN = /(?<!this)\._initPromise/;

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
 * @summary Scans the production trees for one violation pattern.
 * @param {RegExp} pattern
 * @param {String} label
 * @returns {String[]} `file:line: source` entries
 */
function scanFor(pattern, label) {
    const violations = [];

    for (const root of SCAN_ROOTS) {
        for (const file of collectMjsFiles(path.join(repoRoot, root))) {
            const relative = path.relative(repoRoot, file);

            if (EXEMPT_FILES.has(relative)) {
                continue
            }

            fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
                // definitions (`async initAsync()`) and `super.initAsync()` chains are the contract,
                // not violations; comment prose is documentation
                if (isCommentLine(line) || line.includes('async initAsync(')) {
                    return
                }

                if (pattern.test(line)) {
                    violations.push(`${relative}:${index + 1} [${label}]: ${line.trim()}`)
                }
            })
        }
    }

    return violations
}

test.describe('core.Base init/ready contract guard (production trees)', () => {
    test('no external initAsync() call sites exist in src/ or ai/', () => {
        const violations = scanFor(EXTERNAL_INIT_CALL, 'external-initAsync');

        expect(violations,
            'External initAsync() calls double-execute init ("fatal duplication bugs" — src/core/Base.mjs warning). ' +
            'Await the instance\'s ready() instead:\n' + violations.join('\n')
        ).toEqual([])
    });

    test('no _initPromise reach-ins exist in src/ or ai/', () => {
        const violations = scanFor(INIT_PROMISE_REACH_IN, 'initPromise-reach-in');

        expect(violations,
            '`X._initPromise` is a private lifecycle duplication — ready()/isReady are the contract surface. ' +
            'Await the instance\'s ready() instead:\n' + violations.join('\n')
        ).toEqual([])
    });
});
