import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path           from 'node:path';
import {
    CHANGE_CLASS_TO_TYPES,
    COMMIT_TICKET_PATTERN,
    createProgram,
    DECLARED_TICKET_PATTERN,
    detectContractLedgerDrift,
    extractLedgerSignatures,
    filterMjsFiles,
    findShippedSignature,
    getPrBranchCommits,
    normalizeSignatureShape,
    parseArgs,
    parsePrCommitLog,
    runAgentPreflight,
    validateChangeClass,
    validatePrBody,
    validateStackedPrTickets
}                     from '../../../../../ai/scripts/agent-preflight.mjs';

const validBody = [
    'Resolves #12345',
    '',
    'Authored by Euclid (GPT-5, Codex Desktop). Session test.',
    '',
    'Evidence: L2 local unit coverage.',
    '',
    '## AC Evidence',
    '| AC-1 | unit spec: agent-preflight.spec.mjs |',
    '',
    '## Deltas from ticket',
    '- Delivered as requested.',
    '',
    '## Test Evidence',
    '- npm run test-unit -- test/playwright/unit/ai/scripts/agent-preflight.spec.mjs',
    '',
    '## Post-Merge Validation',
    '- None.'
].join('\n');

const draftBody = [
    'Refs #12345',
    '',
    'Authored by Euclid (GPT-5, Codex Desktop). Session test.',
    '',
    'Evidence: L2 local unit coverage. Draft-only helper; no close target yet.',
    '',
    '## AC Evidence',
    '| AC-1 | pending — draft, no close target yet |',
    '',
    '## Deltas from ticket',
    '- Draft helper extracted before the leaf close target is complete.',
    '',
    '## Test Evidence',
    '- npm run test-unit -- test/playwright/unit/ai/scripts/agent-preflight.spec.mjs',
    '',
    '## Post-Merge Validation',
    '- None while draft.'
].join('\n');

test.describe('agent-preflight utility', () => {
    test('builds the Commander program with the expected option surface', () => {
        const program = createProgram();
        const help    = program.helpInformation();

        expect(help).toContain('Usage: agent-preflight [options] [files...]');
        expect(help).toContain('default mode may repair');
        expect(help).toContain('block alignment');
        expect(help).toContain('--change-class <class>');
        expect(help).toContain('capability, restoration, or zero-delta');
        expect(help).toContain('--commit-subject <subject>');
        expect(help).toContain('--pr-title <title>');
        expect(help).toContain('--pr-body <file>');
        expect(help).toContain('--pr-base <ref>');
        expect(help).toContain('--pr-draft');
        expect(help).toContain('--no-fix');
        expect(help).toContain('Check-only mode')
    });

    test('parses files, optional PR body, and fix mode through Commander', () => {
        expect(parseArgs([
            '--change-class', 'capability',
            '--commit-subject', 'feat(build): add a guard (#16111)',
            '--pr-title', 'feat(build): add a guard (#16111)',
            '--pr-body', 'body.md',
            '--pr-base', 'upstream/dev',
            '--pr-draft',
            '--no-fix',
            'src/a.mjs'
        ])).toEqual({
            changeClass  : 'capability',
            commitSubject: 'feat(build): add a guard (#16111)',
            files        : ['src/a.mjs'],
            fix          : false,
            help         : false,
            prBase       : 'upstream/dev',
            prBody       : 'body.md',
            prDraft      : true,
            prTitle      : 'feat(build): add a guard (#16111)'
        });
    });

    test('uses Commander option validation for unknown flags and missing values', () => {
        expect(() => parseArgs(['--bogus'])).toThrow();
        expect(() => parseArgs(['--pr-body'])).toThrow();
        expect(() => parseArgs(['--pr-base'])).toThrow();
        expect(() => parseArgs(['--change-class'])).toThrow();
        expect(() => parseArgs(['--commit-subject'])).toThrow();
        expect(() => parseArgs(['--pr-title'])).toThrow()
    });

    test('filters source gates to .mjs files', () => {
        expect(filterMjsFiles(['src/a.mjs', 'README.md', 'test/spec.mjs'])).toEqual(['src/a.mjs', 'test/spec.mjs'])
    });

    test('accepts a PR body that mirrors the template anchors', () => {
        expect(validatePrBody(validBody).valid).toBe(true)
    });

    test('keeps stacked-ticket parsing on one owning implementation, delegated end-to-end', () => {
        const hostedWorkflow = readFileSync(
            path.join(process.cwd(), '.github/workflows/agent-pr-body-lint.yml'),
            'utf8'
        );
        const guardModule = readFileSync(
            path.join(process.cwd(), 'ai/scripts/lint/prStackingGuard.mjs'),
            'utf8'
        );

        // Hosted lint no longer parses declared tickets itself — it delegates to the committed
        // CLI, whose module re-exports the shared patterns this file enforces author-side.
        expect(hostedWorkflow).toContain('ai/scripts/lint/lintPrStacking.mjs');
        expect(guardModule).toContain("export const DECLARED_TICKET_LINE_PATTERN");
    });

    test('parses the NUL-delimited branch log used by the stacked-PR guard', () => {
        expect(parsePrCommitLog(
            'aaaaaaaaaa\0feat(build): base witness (#15955)\0' +
            'bbbbbbbbbb\0fix(build): stacked repair (#16153)\0'
        )).toEqual([
            {sha: 'aaaaaaaaaa', subject: 'feat(build): base witness (#15955)'},
            {sha: 'bbbbbbbbbb', subject: 'fix(build): stacked repair (#16153)'}
        ])
    });

    test('reads PR branch commits relative to the explicit intended base', () => {
        const calls = [];

        expect(getPrBranchCommits({
            base: 'origin/dev',
            cwd : '/repo',
            execFileSyncImpl(cmd, args, options) {
                calls.push({args, cmd, options});
                return 'aaaaaaaaaa\0fix(build): repair (#16157)\0'
            }
        })).toEqual([
            {sha: 'aaaaaaaaaa', subject: 'fix(build): repair (#16157)'}
        ]);
        expect(calls[0].cmd).toBe('git');
        expect(calls[0].args).toEqual([
            'log',
            '-z',
            '--format=%H%x00%s',
            '--reverse',
            'origin/dev..HEAD'
        ])
    });

    test('accepts a legitimate stack when every commit ticket is declared', () => {
        const result = validateStackedPrTickets(
            `${validBody}\nRelated: #15955`,
            [
                {sha: 'aaaaaaaaaaaa', subject: 'feat(build): base witness (#15955)'},
                {sha: 'bbbbbbbbbbbb', subject: 'fix(build): stacked repair (#12345)'}
            ]
        );

        expect(result.valid).toBe(true);
        expect(result.declaredTickets).toEqual(['12345', '15955']);
        expect(result.foreignCommits).toEqual([])
    });

    test('rejects inherited ticketed commits that the PR body does not declare', () => {
        const result = validateStackedPrTickets(validBody, [
            {sha: '046d3571cd1dbb5e', subject: 'feat(workstation): witness blackout (#15955)'},
            {sha: '3088764ced065a23', subject: 'test(workstation): correct witness (#15955)'},
            {sha: '4da73f690321dc1b', subject: 'fix(dashboard): retain topology (#12345)'}
        ]);

        expect(result.valid).toBe(false);
        expect(result.foreignCommits).toEqual([
            {
                sha    : '046d3571cd',
                subject: 'feat(workstation): witness blackout (#15955)',
                ticket : '15955'
            },
            {
                sha    : '3088764ced',
                subject: 'test(workstation): correct witness (#15955)',
                ticket : '15955'
            }
        ])
    });

    test('allows repeated declared tickets and leaves unticketed subjects to the commit gate', () => {
        const result = validateStackedPrTickets(validBody, [
            {sha: 'aaaaaaaaaaaa', subject: 'feat(build): first slice (#12345)'},
            {sha: 'bbbbbbbbbbbb', subject: 'fix(build): second slice (#12345)'},
            {sha: 'cccccccccccc', subject: 'chore(data): generated sync [skip ci]'}
        ]);

        expect(result.valid).toBe(true);
        expect(result.foreignCommits).toEqual([])
    });

    test('accepts a draft PR body with a non-closing reference instead of Resolves', () => {
        const result = validatePrBody(draftBody, {draft: true});

        expect(result.valid).toBe(true);
        expect(result.missingVisible).toEqual([]);
        expect(result.missingInvisible).toEqual([])
    });

    test('keeps Refs-only bodies invalid for ready PR validation', () => {
        const result = validatePrBody(draftBody);

        expect(result.valid).toBe(false);
        expect(result.missingVisible).toContain('`Resolves #N` is required')
    });

    test('requires at least a non-closing issue reference for draft bodies without Resolves', () => {
        const result = validatePrBody(draftBody.replace('Refs #12345', 'Draft-only note.'), {draft: true});

        expect(result.valid).toBe(false);
        expect(result.missingVisible).toContain('Draft PR bodies without `Resolves #N` require `Refs #N` or `Related: #N`')
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
        expect(stdout).toContain('agent-preflight: PR body contains the required template anchors.');
        expect(stdout).toContain('agent-preflight: stacked PR tickets match 1 declared ticket(s) across 0 commit(s).')
    });

    test('fails before PR creation when a stacked commit ticket is undeclared', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md'],
            cwd             : '/repo',
            execFileSyncImpl: (cmd, args) => {
                if (cmd !== 'git' || args.includes('--name-only')) return '';

                return [
                    '046d3571cd1dbb5e', 'feat(workstation): witness blackout (#15955)',
                    '3088764ced065a23', 'test(workstation): correct witness (#15955)',
                    '4da73f690321dc1b', 'fix(dashboard): retain topology (#12345)',
                    ''
                ].join('\0')
            },
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => validBody,
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(1);
        expect(stdout).toContain('PR body contains the required template anchors');
        expect(stderr).toContain('stacked PR ticket declaration lint failed against origin/dev');
        expect(stderr).toContain('`046d3571cd` claims #15955');
        expect(stderr).toContain('`3088764ced` claims #15955');
        expect(stderr).toContain('1 gate(s) failed: pr-body-stack')
    });

    test('passes the same stack after the inherited ticket is declared', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md'],
            cwd             : '/repo',
            execFileSyncImpl: (cmd, args) => {
                if (cmd !== 'git' || args.includes('--name-only')) return '';

                return [
                    '046d3571cd1dbb5e', 'feat(workstation): witness blackout (#15955)',
                    '3088764ced065a23', 'test(workstation): correct witness (#15955)',
                    '4da73f690321dc1b', 'fix(dashboard): retain topology (#12345)',
                    ''
                ].join('\0')
            },
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => `${validBody}\nRelated: #15955`,
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(0);
        expect(stderr).toBe('');
        expect(stdout).toContain('stacked PR tickets match 2 declared ticket(s) across 3 commit(s)')
    });

    test('emits STALE_OVERLAY findings as a non-blocking local-dev warning (#14675)', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv                           : ['--no-fix'],
            collectStaleOverlayFindingsImpl: () => [{
                label: 'Tier-1 ai/config.mjs',
                items: [
                    'env: NEO_AUTH_MODE',
                    "leaf-default: modelProvider (NEO_MODEL_PROVIDER, string): 'gemini' -> 'openAiCompatible'"
                ]
            }],
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
        expect(stdout).toContain('agent-preflight: STALE_OVERLAY warning(s) (non-blocking):');
        expect(stdout).toContain('Tier-1 ai/config.mjs');
        expect(stdout).toContain('env: NEO_AUTH_MODE');
        expect(stdout).toContain('leaf-default: modelProvider')
    });

    test('runs the draft PR body gate when requested', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv            : ['--pr-body', 'body.md', '--pr-draft'],
            cwd             : '/repo',
            execFileSyncImpl: cmd => cmd === 'git' ? '' : '',
            existsSyncImpl  : () => true,
            readFileSyncImpl: () => draftBody,
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
        // Stable fragments of buildStructuralAnchorMissGuidance() output — the deliberate-
        // silence contract plus the artifact pointer, not full sentences that redden on wording.
        expect(stderr).toContain('checked silently and deliberately');
        expect(stderr).toContain('pull-request-workflow.md');
        expect(stderr).toContain('agent-preflight: 1 gate(s) failed: pr-body')
    })
});

test.describe('agent-preflight — ordered change classes (#16111)', () => {
    test('remains backward compatible when no semantic inputs are supplied', () => {
        expect(validateChangeClass()).toEqual({
            errors       : [],
            expectedTypes: null,
            skipped      : true,
            valid        : true
        })
    });

    test('accepts valid feat, fix, and chore controls', () => {
        expect(validateChangeClass({
            changeClass  : 'capability',
            commitSubject: 'feat(build): add a preflight capability (#16111)',
            prTitle      : 'feat(build)!: add a preflight capability (#16111)'
        }).valid).toBe(true);
        expect(validateChangeClass({
            changeClass  : 'restoration',
            commitSubject: 'fix(build): restore existing validation (#16111)'
        }).valid).toBe(true);
        expect(validateChangeClass({
            changeClass: 'zero-delta',
            prTitle    : 'chore(build): refresh generated metadata (#16111)'
        }).valid).toBe(true)
    });

    test('rejects the exact capability misclassification shapes from #10061 and PR #16110', () => {
        const result = validateChangeClass({
            changeClass  : 'capability',
            commitSubject: 'chore(claude): add per-agent skill discovery (#10059)',
            prTitle      : 'fix(memory-core): make summary receipts replayable (#16105)'
        });

        expect(result.valid).toBe(false);
        expect(result.expectedTypes).toEqual(['feat']);
        expect(result.errors).toEqual([
            'commit subject declares `chore`, but change class `capability` requires `feat`.',
            'PR title declares `fix`, but change class `capability` requires `feat`.'
        ])
    });

    test('accepts the live zero-delta vocabulary (test, docs, ci, build) while capability and restoration stay strict', () => {
        ['test', 'docs', 'ci', 'build', 'chore'].forEach(type => {
            expect(validateChangeClass({
                changeClass  : 'zero-delta',
                commitSubject: `${type}(e2e): a delta with no runtime behavior (#16333)`
            }).valid, `zero-delta must accept ${type}(...)`).toBe(true)
        });

        const mislabeled = validateChangeClass({
            changeClass  : 'capability',
            commitSubject: 'test(e2e): a delta that is really a capability (#16333)'
        });

        expect(mislabeled.valid).toBe(false);
        expect(mislabeled.errors[0]).toContain('change class `capability` requires `feat`');

        const strictRestore = validateChangeClass({
            changeClass  : 'restoration',
            commitSubject: 'test(e2e): a delta that is really a restoration (#16333)'
        });

        expect(strictRestore.valid).toBe(false);
        expect(strictRestore.errors[0]).toContain('change class `restoration` requires `fix`');

        const overclaimed = validateChangeClass({
            changeClass  : 'zero-delta',
            commitSubject: 'feat(e2e): a capability mislabeled as zero-delta (#16333)'
        });

        expect(overclaimed.valid).toBe(false);
        expect(overclaimed.errors[0]).toContain(
            'change class `zero-delta` requires one of `chore`, `test`, `docs`, `ci`, `build`.'
        )
    });

    test('the policy is not mutable through the exported map or a returned observation', () => {
        // Every nested policy array is frozen — the shallow outer freeze is not the whole guard.
        Object.values(CHANGE_CLASS_TO_TYPES).forEach(types => {
            expect(Object.isFrozen(types)).toBe(true)
        });
        expect(() => { CHANGE_CLASS_TO_TYPES['zero-delta'].push('feat') }).toThrow(TypeError);

        // Mutating one returned observation must not change a later validation's policy.
        const first = validateChangeClass({
            changeClass  : 'zero-delta',
            commitSubject: 'feat(e2e): a capability mislabeled as zero-delta (#16333)'
        });

        expect(first.valid).toBe(false);

        first.expectedTypes.push('feat');

        const second = validateChangeClass({
            changeClass  : 'zero-delta',
            commitSubject: 'feat(e2e): a capability mislabeled as zero-delta (#16333)'
        });

        expect(
            second.valid,
            'mutating a prior result must never make a later zero-delta + feat validation pass'
        ).toBe(false);
        expect(second.expectedTypes).toEqual(['chore', 'test', 'docs', 'ci', 'build'])
    });

    test('rejects chore for a restoration delta', () => {
        const result = validateChangeClass({
            changeClass  : 'restoration',
            commitSubject: 'chore(core): restore the existing lifecycle (#16111)'
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('change class `restoration` requires `fix`')
    });

    test('fails closed for partial inputs, unknown classes, and missing prefixes', () => {
        expect(validateChangeClass({
            commitSubject: 'feat(build): add a guard (#16111)'
        }).errors).toContain(
            '`--change-class` is required when `--commit-subject` or `--pr-title` is provided.'
        );
        expect(validateChangeClass({
            changeClass: 'capability'
        }).errors).toContain(
            '`--change-class` requires at least one `--commit-subject` or `--pr-title` to validate.'
        );
        expect(validateChangeClass({
            changeClass  : 'documentation',
            commitSubject: 'docs: explain the guard (#16111)'
        }).errors).toContain(
            'Unknown change class `documentation`; expected capability, restoration, or zero-delta.'
        );
        expect(validateChangeClass({
            changeClass  : 'toString',
            commitSubject: 'feat(build): evade an inherited-key check (#16111)'
        }).errors).toContain(
            'Unknown change class `toString`; expected capability, restoration, or zero-delta.'
        );
        expect(validateChangeClass({
            changeClass  : 'capability',
            commitSubject: 'add a guard'
        }).errors[0]).toContain('missing a valid Conventional Commit prefix')
    });

    test('checks commit subject and PR title against the same declared class in the CLI path', () => {
        let stdout = '';
        let stderr = '';

        const status = runAgentPreflight({
            argv: [
                '--change-class', 'capability',
                '--commit-subject', 'feat(build): add a guard (#16111)',
                '--pr-title', 'fix(build): add a guard (#16111)'
            ],
            collectStaleOverlayFindingsImpl: () => [],
            cwd                            : '/repo',
            execFileSyncImpl               : cmd => cmd === 'git' ? '' : '',
            existsSyncImpl                 : () => false,
            readFileSyncImpl               : () => '',
            stderr                         : {write: value => { stderr += value }},
            stdout                         : {write: value => { stdout += value }}
        });

        expect(status).toBe(1);
        expect(stdout).toContain('0 .mjs files in scope');
        expect(stderr).toContain('change-class validation failed');
        expect(stderr).toContain('PR title declares `fix`');
        expect(stderr).toContain('1 gate(s) failed: change-class')
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
            stderr          : {write: value => { stderr += value }},
            stdout          : {write: value => { stdout += value }}
        });

        expect(status).toBe(0); // drift is WARN-only — never fails the preflight
        expect(stdout).toContain('Contract Ledger drift warning');
        expect(stdout).toContain('shouldYieldLease');
        expect(stderr).toBe('')
    })
});
