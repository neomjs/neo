import {test, expect} from '@playwright/test';
import path           from 'node:path';
import {
    createProgram,
    detectContractLedgerDrift,
    extractLedgerSignatures,
    filterMjsFiles,
    findShippedSignature,
    normalizeSignatureShape,
    parseArgs,
    runAgentPreflight,
    validatePrBody
}                     from '../../../../../../buildScripts/util/agent-preflight.mjs';

const validBody = [
    'Resolves #12345',
    '',
    'Authored by Euclid (GPT-5, Codex Desktop). Session test.',
    '',
    'Evidence: L2 local unit coverage.',
    '',
    '## Deltas from ticket',
    '- Delivered as requested.',
    '',
    '## Test Evidence',
    '- npm run test-unit -- test/playwright/unit/ai/buildScripts/util/agent-preflight.spec.mjs',
    '',
    '## Post-Merge Validation',
    '- None.'
].join('\n');

test.describe('agent-preflight utility', () => {
    test('builds the Commander program with the expected option surface', () => {
        const program = createProgram();
        const help    = program.helpInformation();

        expect(help).toContain('Usage: agent-preflight [options] [files...]');
        expect(help).toContain('default mode may repair');
        expect(help).toContain('block alignment');
        expect(help).toContain('--pr-body <file>');
        expect(help).toContain('--no-fix');
        expect(help).toContain('Check-only mode')
    });

    test('parses files, optional PR body, and fix mode through Commander', () => {
        expect(parseArgs(['--pr-body', 'body.md', '--no-fix', 'src/a.mjs'])).toEqual({
            files : ['src/a.mjs'],
            fix   : false,
            help  : false,
            prBody: 'body.md'
        });
    });

    test('uses Commander option validation for unknown flags and missing values', () => {
        expect(() => parseArgs(['--bogus'])).toThrow();
        expect(() => parseArgs(['--pr-body'])).toThrow()
    });

    test('filters source gates to .mjs files', () => {
        expect(filterMjsFiles(['src/a.mjs', 'README.md', 'test/spec.mjs'])).toEqual(['src/a.mjs', 'test/spec.mjs'])
    });

    test('accepts a PR body that mirrors the template anchors', () => {
        expect(validatePrBody(validBody).valid).toBe(true)
    });

    test('reports visible misses and forbidden close keywords without naming structural anchors', () => {
        const result = validatePrBody([
            'Closes #12345',
            '',
            '## Test Evidence',
            '## Post-Merge Validation'
        ].join('\n'));

        expect(result.valid).toBe(false);
        expect(result.missingVisible).toContain('Evidence:');
        expect(result.missingVisible).toContain('`Closes #N` is forbidden; use `Resolves #N`');
        expect(result.missingVisible).toContain('`Resolves #N` is required');
        expect(result.missingInvisible.length).toBe(2)
    });

    test('uses staged files by default and runs archaeology plus block-alignment gates in order', () => {
        const calls = [];

        const execFileSyncImpl = (cmd, args) => {
            calls.push({cmd, args});

            if (cmd === 'git') {
                return 'src/a.mjs\nREADME.md\ntest/spec.mjs\n'
            }

            return `${path.basename(args[0])} ok\n`
        };

        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            cwd             : '/repo',
            execFileSyncImpl,
            existsSyncImpl  : () => false,
            readFileSyncImpl: () => '',
            scriptDir       : '/repo/buildScripts/util',
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(0);
        expect(stderr).toBe('');
        expect(calls[0]).toEqual({
            cmd : 'git',
            args: ['diff', '--cached', '--name-only', '--diff-filter=ACMR']
        });
        expect(calls.slice(1).map(call => path.basename(call.args[0]))).toEqual([
            'check-ticket-archaeology.mjs',
            'check-block-alignment.mjs',
            'check-block-alignment.mjs'
        ]);
        expect(calls[2].args).toContain('--fix');
        expect(calls[3].args).toContain('--staged');
        expect(stdout).toContain('agent-preflight: repair mode enabled; running check-block-alignment --fix');
        expect(stdout).toContain('agent-preflight: no --pr-body provided; skipped PR-body lint.');
        expect(stdout).toContain('agent-preflight: all requested gates passed.')
    });

    test('--no-fix skips the block-alignment repair gate but keeps staged checks', () => {
        const calls = [];

        const execFileSyncImpl = (cmd, args) => {
            calls.push({cmd, args});

            return `${path.basename(args[0])} ok\n`
        };

        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--no-fix', 'src/a.mjs'],
            cwd             : '/repo',
            execFileSyncImpl,
            existsSyncImpl  : () => false,
            readFileSyncImpl: () => '',
            scriptDir       : '/repo/buildScripts/util',
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(0);
        expect(stderr).toBe('');
        expect(calls.map(call => path.basename(call.args[0]))).toEqual([
            'check-ticket-archaeology.mjs',
            'check-block-alignment.mjs'
        ]);
        expect(calls.some(call => call.args.includes('--fix'))).toBe(false);
        expect(calls[1].args).toContain('--staged');
        expect(stdout).toContain('agent-preflight: check-only mode; skipped check-block-alignment --fix.');
        expect(stdout).toContain('agent-preflight: all requested gates passed.')
    });

    test('runs the PR body gate when requested', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md'],
            cwd             : '/repo',
            execFileSyncImpl: cmd => cmd === 'git' ? '' : '',
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => validBody,
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(0);
        expect(stderr).toBe('');
        expect(stdout).toContain('agent-preflight: 0 .mjs files in scope; skipped source gates.');
        expect(stdout).toContain('agent-preflight: PR body contains the required template anchors.')
    });

    test('returns failure when the local PR body is missing required anchors', () => {
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md', 'src/a.mjs'],
            cwd             : '/repo',
            execFileSyncImpl: () => '',
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => 'Refs #12345',
            scriptDir       : '/repo/buildScripts/util',
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: () => {}}
        });

        expect(status).toBe(1);
        expect(stderr).toContain('agent-preflight: PR body template lint failed.');
        expect(stderr).toContain('Visible/body-closing misses:');
        expect(stderr).toContain('Structural template anchors are missing');
        expect(stderr).toContain('agent-preflight: 1 gate(s) failed: pr-body')
    })
});

test.describe('agent-preflight — Contract Ledger drift (#14119)', () => {
    const ledgerBody = [
        '## Contract Ledger',
        '',
        '| Surface | Signature | Consumer | Notes |',
        '|---|---|---|---|',
        '| yield check | `shouldYieldLease(lease)` | kbSync | reads the bound |',
        '| assemble | `assembleEvidence({diagnoses, serviceId})` | runner | folds diagnoses |'
    ].join('\n');

    test('extracts only signatures from a Surface+Signature ledger table', () => {
        expect(extractLedgerSignatures(ledgerBody)).toEqual([
            {symbol: 'shouldYieldLease', params: 'lease'},
            {symbol: 'assembleEvidence', params: '{diagnoses, serviceId}'}
        ])
    });

    test('scans only the Signature cell — incidental parens in a Surface/Notes column are ignored', () => {
        // Surface has `reconfigure(key)` and Notes has `migrate(old)`; neither is the declared signature.
        // Only the Signature cell's `applyHeal(action, evidence)` must be extracted (without cell-scoping the
        // whole-row match would wrongly return reconfigure(key) — the first paren token in the row).
        const incidentalBody = [
            '| Surface | Signature | Consumer | Notes |',
            '|---|---|---|---|',
            '| reconfigure(key) drift | `applyHeal(action, evidence)` | actuator | replaces migrate(old) |'
        ].join('\n');
        expect(extractLedgerSignatures(incidentalBody)).toEqual([
            {symbol: 'applyHeal', params: 'action, evidence'}
        ])
    });

    test('a non-ledger body yields no signatures — the check is opt-in/inert', () => {
        expect(extractLedgerSignatures('## Summary\njust prose, foo(bar) in a sentence')).toEqual([]);
        expect(detectContractLedgerDrift({body: 'no ledger here', diffText: '+ foo(a, b, c)'})).toEqual([])
    });

    test('no staged diff → no check (falsy diffText is inert)', () => {
        expect(detectContractLedgerDrift({body: ledgerBody, diffText: ''})).toEqual([])
    });

    test('a matching shipped signature is NOT flagged', () => {
        expect(detectContractLedgerDrift({
            body: ledgerBody, diffText: '+function shouldYieldLease(lease) {\n+    return true\n+}'
        })).toEqual([])
    });

    test('destructured key REORDER is normalized — NOT flagged (no false positive)', () => {
        expect(detectContractLedgerDrift({
            body: ledgerBody, diffText: '+export function assembleEvidence({serviceId, diagnoses}) {'
        })).toEqual([])
    });

    test('a symbol absent from the diff is NOT flagged — a miss is silent', () => {
        expect(detectContractLedgerDrift({body: ledgerBody, diffText: '+const unrelated = 1'})).toEqual([])
    });

    test('a genuine arity increase IS flagged', () => {
        const warnings = detectContractLedgerDrift({
            body: ledgerBody, diffText: '+function shouldYieldLease(lease, now, force) {'
        });
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain('shouldYieldLease')
    });

    test('a positional→destructured shape change IS flagged (the #14104 class)', () => {
        const warnings = detectContractLedgerDrift({
            body: ledgerBody, diffText: '+function shouldYieldLease({lease, now}) {'
        });
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain('shouldYieldLease')
    });

    test('normalizeSignatureShape: positional arity vs destructured key-set, order-insensitive', () => {
        expect(normalizeSignatureShape('a, b')).toEqual({shape: 'positional', arity: 2, keys: []});
        expect(normalizeSignatureShape('{b, a}')).toEqual({shape: 'destructured', arity: 2, keys: ['a', 'b']});
        expect(normalizeSignatureShape('')).toEqual({shape: 'positional', arity: 0, keys: []})
    });

    test('findShippedSignature returns the DEFINITION params (not a call-site) or null', () => {
        expect(findShippedSignature('+function foo(a, b) {', 'foo')).toBe('a, b');
        expect(findShippedSignature('+function foo(a) {', 'bar')).toBe(null);
        expect(findShippedSignature('-function foo(a) {', 'foo')).toBe(null);
        // A bare call-site (no `{`/`=>` after the params) is NOT a definition — never matched.
        expect(findShippedSignature('+    const r = foo(a, b);', 'foo')).toBe(null);
        // Call-before-def: the call-site is skipped, the definition wins (not the call's args).
        expect(findShippedSignature('+    if (shouldYield(lease)) return;\n+function shouldYield(lease, now) {', 'shouldYield')).toBe('lease, now')
    });

    test('a call-site before the definition does NOT produce a false drift warning', () => {
        const callBeforeDefLedger = [
            '| Surface | Signature | Consumer | Notes |',
            '|---|---|---|---|',
            '| yield | `shouldYield(lease, now)` | runner | the bound |'
        ].join('\n');
        // The CALL `shouldYield(lease)` (arity 1) precedes the DEF `shouldYield(lease, now)` (arity 2);
        // without definition-only matching this false-warns (ledger 2 vs call-site 1).
        const diff = '+    if (shouldYield(lease)) return;\n+function shouldYield(lease, now) {';
        expect(detectContractLedgerDrift({body: callBeforeDefLedger, diffText: diff})).toEqual([])
    });

    test('runAgentPreflight emits a non-blocking drift WARNING through the --pr-body path', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md'],
            cwd             : '/repo',
            execFileSyncImpl: (cmd, args) => {
                if (cmd === 'git' && args.includes('--name-only')) return '';      // no staged source files
                if (cmd === 'git') return '+function shouldYieldLease(lease, now, force) {'; // the drifted diff
                return ''
            },
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => `${validBody}\n${ledgerBody}`,
            stderr: {write: value => { stderr += value }},
            stdout: {write: value => { stdout += value }}
        });

        expect(status).toBe(0); // drift is WARN-only — never fails the preflight
        expect(stdout).toContain('Contract Ledger drift warning');
        expect(stdout).toContain('shouldYieldLease');
        expect(stderr).toBe('')
    })
});
