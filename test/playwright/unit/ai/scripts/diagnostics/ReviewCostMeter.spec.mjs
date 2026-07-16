import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'ReviewCostMeterTest'}});

import {execFileSync}  from 'child_process';
import {fileURLToPath} from 'url';
import {expect, test}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import {
    analyzeReviewCost,
    REVIEW_COST_METER_HELP
} from '../../../../../../ai/scripts/diagnostics/review-cost-meter.mjs';

const scriptPath = fileURLToPath(new URL('../../../../../../ai/scripts/diagnostics/review-cost-meter.mjs', import.meta.url));

function review({author='neo-opus-grace', body, commit, state='CHANGES_REQUESTED', submittedAt}) {
    return {
        author: {login: author},
        body,
        commit: {oid: commit},
        state,
        submittedAt
    }
}

const COMPLETE_DROP_SUPERSEDE_BODY = [
    '**Status:** Drop+Supersede',
    '- **Decision**: Drop+Supersede',
    '- **Disposition:** implementation-off',
    '- **Source-coordinate falsifiers:** `src/example.mjs:10`',
    '- **Salvage map:** reuse the parser',
    '- **Successor landing pad:** ticket #16000',
    '- **Successor map citation:** ticket #16000 cites this map'
].join('\n');

test.describe('review-cost-meter (#15257)', () => {
    test('emits the OQ5 cycle, byte, stratum, and formal RC2-to-terminal metrics', () => {
        const report = analyzeReviewCost({
            author  : {login: 'neo-opus-grace'},
            title   : 'Managed review gate',
            body    : 'Resolves #15257',
            state   : 'MERGED',
            mergedAt: '2026-07-16T11:05:00Z',
            files   : [{path: 'ai/services/github-workflow/PullRequestService.mjs'}],
            comments: [{body: 'author response'}],
            reviews : [
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract schema lacks a required boundary\n- [ ] RA-2: Add test evidence',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:00:00Z'
                }),
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract schema still lacks the boundary\n- [ ] RA-3: Template metadata drifts\nCarried-vs-new census: carried=[RA-1]; new=[RA-3]',
                    commit     : 'bbb2222',
                    submittedAt: '2026-07-16T11:00:00Z'
                }),
                review({
                    body       : 'No required actions — eligible for human merge.',
                    commit     : 'bbb2222',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T11:30:00Z'
                })
            ]
        }, 15257);

        expect(report.ordinaryRequestChanges).toBe(2);
        expect(report.raw.submittedRequestChanges).toBe(2);
        expect(report.uniqueHeads).toEqual(['aaa1111', 'bbb2222']);
        expect(report.cycles[1].carriedClusters).toEqual(['RA-1']);
        expect(report.cycles[1].newClusters).toEqual(['RA-3']);
        expect(report.falsifierClassCurve.values).toEqual([2, 2, 0]);
        expect(report.findingsPreventableUpstream.count).toBe(0);
        expect(report.findingsPreventableUpstream.unknownCount).toBe(4);
        expect(report.discussionBytes.total).toBeGreaterThan(0);
        expect(report.rc2ToTerminal.milliseconds).toBe(30 * 60 * 1000);
        expect(report.rc2ToTerminal.source).toBe('formal-review-replay');
        expect(report.stratum).toBe('enforcement-security-adjacent');
    });

    test('same-head pairs consume only RC objects and classify the two corpus exceptions', () => {
        const report = analyzeReviewCost({
            closedAt: '2026-07-16T12:00:00Z',
            state   : 'CLOSED',
            reviews : [
                review({
                    body       : '**Status:** Request Changes\n### 📋 Required Actions\n- [ ] RA-1: Contract boundary',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:00:00Z'
                }),
                review({
                    body       : '**Status:** Request Changes\nCorrective, template-complete review preserves RA-1.',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:02:00Z'
                }),
                review({
                    body       : '**Status:** Approved',
                    commit     : 'bbb2222',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T10:30:00Z'
                }),
                review({
                    body       : '**Status:** Approved',
                    commit     : 'bbb2222',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T10:31:00Z'
                }),
                review({
                    body       : '**Status:** Request Changes\nI am retracting approval after a new exact-head falsifier.',
                    commit     : 'bbb2222',
                    submittedAt: '2026-07-16T10:32:00Z'
                })
            ]
        });

        expect(report.raw.submittedRequestChanges).toBe(3);
        expect(report.ordinaryRequestChanges).toBe(2);
        expect(report.sameHeadPairClassifications.map(pair => pair.classification)).toEqual([
            'machinery-corrective',
            'honest-retraction'
        ]);
    });

    test('recognizes the legacy terminal Drop-and-Supersede marker in the evidence corpus', () => {
        const report = analyzeReviewCost({
            closedAt: '2026-07-16T12:00:00Z',
            state   : 'CLOSED',
            reviews : [review({
                body       : '- **Decision:** `[DROP_AND_SUPERSEDE]` — close without merging.',
                commit     : 'deadbee',
                submittedAt: '2026-07-16T11:00:00Z'
            })]
        });

        expect(report.ordinaryRequestChanges).toBe(0);
        expect(report.terminalDropSupersede).toBe(1);
        expect(report.dropSupersedeClassifications[0].basis).toBe('legacy-intent');
    });

    test('separates a contract-complete Drop+Supersede from ordinary RC count', () => {
        const report = analyzeReviewCost({
            files  : [{path: 'apps/demo/view/MainContainer.mjs'}],
            reviews: [review({
                body       : COMPLETE_DROP_SUPERSEDE_BODY,
                commit     : 'deadbee',
                submittedAt: '2026-07-16T12:00:00Z'
            })]
        });

        expect(report.raw.submittedRequestChanges).toBe(1);
        expect(report.ordinaryRequestChanges).toBe(0);
        expect(report.terminalDropSupersede).toBe(1);
        expect(report.stratum).toBe('ordinary-product-metadata');
    });

    test('reproduces the #15226 four-contact falsifier prefix without PR-specific rules', () => {
        const report = analyzeReviewCost({
            author : {login: 'neo-opus-grace'},
            reviews: [
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract boundary\n- [ ] RA-2: Test evidence',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:00:00Z'
                }),
                review({
                    body       : 'No required actions — eligible for human merge.',
                    commit     : 'bbb2222',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T10:10:00Z'
                }),
                review({
                    body       : 'I am retracting approval after a new exact-head falsifier.\n### 📋 Required Actions\n- [ ] RA-1: Reviewer correction',
                    commit     : 'bbb2222',
                    submittedAt: '2026-07-16T10:11:00Z'
                }),
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract test metadata',
                    commit     : 'ccc3333',
                    submittedAt: '2026-07-16T10:20:00Z'
                })
            ]
        });

        expect(report.falsifierClassCurve.values).toEqual([2, 0, 1, 3]);
        expect(report.sameHeadPairClassifications.map(item => item.classification)).toEqual(['honest-retraction']);
    });

    test('keeps actual blocker clusters distinct and trusts only an explicit census', () => {
        const report = analyzeReviewCost({
            reviews: [review({
                body       : '### 📋 Required Actions\n- [ ] RA-1: Contract boundary alpha\n- [ ] RA-2: Contract boundary beta\nCarried-vs-new census: carried=[RA-1]; new=[RA-2]',
                commit     : 'aaa1111',
                submittedAt: '2026-07-16T10:00:00Z'
            })]
        });

        expect(report.cycles[0].findingClusters).toHaveLength(2);
        expect(report.cycles[0].falsifierClasses).toEqual(['contract-boundary']);
        expect(report.cycles[0].carriedClusters).toEqual(['RA-1']);
        expect(report.cycles[0].newClusters).toEqual(['RA-2']);
        expect(report.cycles[0].clusterConfidence).toBe('explicit');
    });

    test('counts preventability only from a different explicitly named authority owner', () => {
        const report = analyzeReviewCost({
            author : {login: 'neo-opus-grace'},
            reviews: [review({
                body: [
                    '### 📋 Required Actions',
                    '- [ ] RA-1: [authority-owner:@neo-opus-ada] Contract boundary',
                    '- [ ] RA-2: [authority-owner:@neo-opus-grace] Test evidence',
                    '- [ ] RA-3: Metadata wording'
                ].join('\n'),
                commit     : 'aaa1111',
                submittedAt: '2026-07-16T10:00:00Z'
            })]
        });

        expect(report.findingsPreventableUpstream.count).toBe(1);
        expect(report.findingsPreventableUpstream.findings[0].authorityOwner).toBe('@neo-opus-ada');
        expect(report.findingsPreventableUpstream.unknownCount).toBe(1);
    });

    test('replays reviewer blockers and ignores lifecycle close timestamps', () => {
        const report = analyzeReviewCost({
            closedAt: '2026-07-16T10:15:00Z',
            state   : 'CLOSED',
            reviews : [
                review({
                    author     : 'neo-opus-ada',
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract boundary',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:00:00Z'
                }),
                review({
                    author     : 'neo-fable',
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Test evidence',
                    commit     : 'bbb2222',
                    submittedAt: '2026-07-16T10:10:00Z'
                }),
                review({
                    author     : 'neo-opus-ada',
                    body       : 'Approved',
                    commit     : 'ccc3333',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T10:20:00Z'
                }),
                review({
                    author     : 'neo-fable',
                    body       : 'Approved',
                    commit     : 'ccc3333',
                    state      : 'APPROVED',
                    submittedAt: '2026-07-16T10:30:00Z'
                })
            ]
        });

        expect(report.rc2ToTerminal.milliseconds).toBe(20 * 60 * 1000);
        expect(report.rc2ToTerminal.terminalAt).toBe('2026-07-16T10:30:00Z');
        expect(report.rc2ToTerminal.terminalState).toBe('APPROVED');
    });

    test('reports no terminal when a PR closes without formal approval or eligible D+S', () => {
        const report = analyzeReviewCost({
            closedAt: '2026-07-16T10:30:00Z',
            state   : 'CLOSED',
            reviews : [
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Contract boundary',
                    commit     : 'aaa1111',
                    submittedAt: '2026-07-16T10:00:00Z'
                }),
                review({
                    body       : '### 📋 Required Actions\n- [ ] RA-1: Test evidence',
                    commit     : 'bbb2222',
                    submittedAt: '2026-07-16T10:10:00Z'
                })
            ]
        });

        expect(report.rc2ToTerminal).toBeNull();
    });

    test('requires validator-complete provenance for post-cutover Drop+Supersede', () => {
        const base = {
            author                        : {login: 'neo-opus-grace'},
            createdAt                     : '2026-07-16T12:00:01Z',
            reviewBudgetActivationMergedAt: '2026-07-16T12:00:00Z'
        };
        const incomplete = analyzeReviewCost({...base, reviews: [review({
            body       : '**Status:** Drop+Supersede\n- **Decision**: Drop+Supersede\n[review-budget-managed]\noutcome: terminal-drop-supersede',
            commit     : 'aaa1111',
            submittedAt: '2026-07-16T12:10:00Z'
        })]});
        const complete = analyzeReviewCost({...base, reviews: [review({
            body       : `${COMPLETE_DROP_SUPERSEDE_BODY}\n[review-budget-managed]\noutcome: terminal-drop-supersede`,
            commit     : 'bbb2222',
            submittedAt: '2026-07-16T12:10:00Z'
        })]});

        expect(incomplete.terminalDropSupersede).toBe(0);
        expect(incomplete.ordinaryRequestChanges).toBe(1);
        expect(incomplete.invalidDropSupersede).toBe(1);
        expect(complete.terminalDropSupersede).toBe(1);
        expect(complete.ordinaryRequestChanges).toBe(0);
    });

    test('classifies either one-sided Drop+Supersede anchor as invalid terminal intent', () => {
        const base = {
            createdAt                     : '2026-07-16T12:00:01Z',
            reviewBudgetActivationMergedAt: '2026-07-16T12:00:00Z'
        };
        const bodies = [
            COMPLETE_DROP_SUPERSEDE_BODY.replace('**Status:** Drop+Supersede', '**Status:** Request Changes'),
            COMPLETE_DROP_SUPERSEDE_BODY.replace('- **Decision**: Drop+Supersede', '- **Decision**: Request Changes')
        ];

        for (const [index, body] of bodies.entries()) {
            const report = analyzeReviewCost({...base, reviews: [review({
                body       : `${body}\n[review-budget-managed]\noutcome: terminal-drop-supersede`,
                commit     : `head${index}`,
                submittedAt: '2026-07-16T12:10:00Z'
            })]});

            expect(report.terminalDropSupersede).toBe(0);
            expect(report.ordinaryRequestChanges).toBe(1);
            expect(report.invalidDropSupersede).toBe(1);
            expect(report.dropSupersedeClassifications[0].intent).toBe('modern-incomplete');
            expect(report.dropSupersedeClassifications[0].missingFields).toContain('Status + Decision')
        }
    });

    test('uses the dominant non-test production surface for the corpus stratum', () => {
        const ordinary = analyzeReviewCost({files: [
            ...Array.from({length: 10}, (_, index) => ({path: `apps/fleet/view/Product${index}.mjs`})),
            {path: '.agents/skills/pr-review/SKILL.md'},
            {path: '.agents/skills/pr-review/references/guide.md'}
        ]});
        const enforcement = analyzeReviewCost({files: [
            {path: 'ai/scripts/lifecycle/stop-hook.mjs'},
            {path: 'test/playwright/unit/ai/scripts/lifecycle/StopHook.spec.mjs'}
        ]});

        expect(ordinary.stratum).toBe('ordinary-product-metadata');
        expect(enforcement.stratum).toBe('enforcement-security-adjacent');
    });

    test('--help is available without invoking gh', () => {
        const output = execFileSync(process.execPath, [scriptPath, '--help'], {encoding: 'utf8'});

        expect(output).toContain(REVIEW_COST_METER_HELP.split('\n')[0]);
        expect(output).toContain('ordinary/submitted RC counts');
    });
});
