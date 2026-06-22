import {test, expect} from '@playwright/test';
import path           from 'node:path';
import {
    createProgram,
    filterMjsFiles,
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

        expect(program.helpInformation()).toContain('Usage: agent-preflight [options] [files...]');
        expect(program.helpInformation()).toContain('--pr-body <file>');
        expect(program.helpInformation()).toContain('--no-fix')
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
        expect(stdout).toContain('agent-preflight: no --pr-body provided; skipped PR-body lint.');
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
