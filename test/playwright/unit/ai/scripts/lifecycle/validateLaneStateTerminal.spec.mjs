import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'ValidateLaneStateTerminalTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {collectLaneStateToolEvidenceFromJsonl,
        collectLaneStateToolEvidenceFromMessages,
        extractPrNumberFromGateRef,
        hasSameTurnPrFetchEvidence,
        validateLaneStateTerminal} from '../../../../../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

test.describe('validateLaneStateTerminal — turn-terminal evidence shape', () => {
    const NOW = '2026-06-20T00:00:00.000Z';

    test('valid next-lane passes', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'next-lane'});
        expect(result.valid).toBe(true);
        expect(result.violations).toEqual([]);
    });

    test('blocker-routed passes', () => {
        expect(validateLaneStateTerminal({laneContinuation: 'blocker-routed'}).valid).toBe(true);
    });

    test('active-lane passes when it is real work (not an own-PR watch)', () => {
        expect(validateLaneStateTerminal({laneContinuation: 'active-lane', awaitingOwnPrOnly: false}).valid).toBe(true);
    });

    test('a wakeDisposition alone is not a terminal', () => {
        const result = validateLaneStateTerminal({wakeDisposition: 'awareness'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('laneContinuation is required');
    });

    test('active-lane fails when it is only an own PR awaiting merge/review/CI', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'active-lane', awaitingOwnPrOnly: true});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('background watch');
    });

    test('a named gate without a same-turn checkedAt fails (the stale-merged-gate class)', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #13568'}]   // no checkedAt
        });
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('checkedAt');
    });

    test('an issue gate WITH a same-turn checkedAt passes without PR fetch evidence', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'issue #13572', checkedAt: NOW}]
        });
        expect(result.valid).toBe(true);
    });

    test('a PR gate with checkedAt but no same-turn PR fetch evidence fails (#14713)', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #13572', checkedAt: NOW}]
        });
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('no same-turn PR fetch evidence');
    });

    test('a PR gate WITH checkedAt and same-turn gh fetch evidence passes (#14713)', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #13572', checkedAt: NOW}]
        }, {
            evidenceText: 'tool_call: gh pr view 13572 --json state,mergedAt,reviewDecision'
        });
        expect(result.valid).toBe(true);
    });

    test('verified-no-lane is retired — now rejected as an unknown (non-driving) continuation', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'verified-no-lane'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain("Unknown laneContinuation 'verified-no-lane'");
    });

    test('an unknown laneContinuation (e.g. "holding") fails', () => {
        const result = validateLaneStateTerminal({laneContinuation: 'holding'});
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain("Unknown laneContinuation 'holding'");
    });

    test('a named gate claiming merge state must cite field mergedAt, not state', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #12619', checkedAt: NOW, mergeClaim: true, field: 'state'}]
        });
        expect(result.valid).toBe(false);
        expect(result.violations.join(' ')).toContain('must read mergedAt');
    });

    test('a merge-claim gate citing field mergedAt passes', () => {
        const result = validateLaneStateTerminal({
            laneContinuation: 'next-lane',
            namedGates      : [{ref: 'PR #12619', checkedAt: NOW, mergeClaim: true, field: 'mergedAt'}]
        }, {
            evidenceText: 'tool_call: gh pr view 12619 --json state,mergedAt,reviewDecision'
        });
        expect(result.valid).toBe(true);
    });

    test('extractPrNumberFromGateRef only treats explicit PR refs as PR-shaped gates', () => {
        expect(extractPrNumberFromGateRef('PR #14822')).toBe(14822);
        expect(extractPrNumberFromGateRef('pull request 14822')).toBe(14822);
        expect(extractPrNumberFromGateRef('issue #14822')).toBeNull();
    });

    test('same-turn evidence accepts scoped GitHub PR fetches, not unrelated PR text', () => {
        expect(hasSameTurnPrFetchEvidence(14822, 'gh pr view 14822 --json state,mergedAt')).toBe(true);
        expect(hasSameTurnPrFetchEvidence(14822, 'get_conversation {"pr_number":14822}')).toBe(true);
        expect(hasSameTurnPrFetchEvidence(14822, 'github_tool {"pr_number":14822,"mergeStateStatus":"CLEAN"}')).toBe(true);
        expect(hasSameTurnPrFetchEvidence(14822, 'mentioned PR #14822 in final prose')).toBe(false);
    });

    test('same-turn PR mutation or diff calls do not satisfy PR state-fetch evidence (#14713)', () => {
        const mutationEvidence = [
            'manage_pr_review {"pr_number":14822,"state":"APPROVED"}',
            'manage_pr_reviewers {"pr_number":14822,"reviewers":["neo-opus-grace"]}',
            'get_pull_request_diff {"pr_number":14822}'
        ];

        for (const evidenceText of mutationEvidence) {
            expect(hasSameTurnPrFetchEvidence(14822, evidenceText)).toBe(false);

            const result = validateLaneStateTerminal({
                laneContinuation: 'next-lane',
                namedGates      : [{ref: 'PR #14822', checkedAt: NOW}]
            }, {
                evidenceText
            });

            expect(result.valid).toBe(false);
            expect(result.violations.join(' ')).toContain('no same-turn PR fetch evidence');
        }
    });

    test('collects PR fetch evidence from Claude-style tool_use JSONL', () => {
        const jsonl = [
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [
                {type: 'tool_use', name: 'Bash', input: {command: 'gh pr view 14822 --json state,mergedAt'}}
            ]}}),
            JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [
                {type: 'text', text: 'Final text mentions gh pr view 1 but is not tool evidence'}
            ]}})
        ].join('\n');

        const evidence = collectLaneStateToolEvidenceFromJsonl(jsonl);
        expect(evidence).toContain('gh pr view 14822');
        expect(evidence).not.toContain('Final text mentions');
    });

    test('collects PR fetch evidence from Codex-style function-call records', () => {
        const evidence = collectLaneStateToolEvidenceFromMessages([
            {type: 'response_item', payload: {type: 'function_call', name: 'functions.exec_command', arguments: '{"cmd":"gh pr view 14822 --json state"}'}},
            {role: 'assistant', content: 'Final text mentions gh pr view 1 but is not tool evidence'}
        ]);

        expect(evidence).toContain('gh pr view 14822');
        expect(evidence).not.toContain('Final text mentions');
    });
});
