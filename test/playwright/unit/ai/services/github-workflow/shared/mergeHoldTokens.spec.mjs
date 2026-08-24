import {test, expect}                     from '@playwright/test';
import {mergeHoldToken, resolveMergeHold} from '../../../../../../../ai/services/github-workflow/shared/mergeHoldTokens.mjs';

/**
 * Pure arms for the reviewer-hold reader.
 *
 * These exist because the composed service path could not see them. Every original arm ran through
 * `PullRequestService`, whose fixtures all happen to give the holder an APPROVED review — so the
 * two contracts that had no coverage at all were the two that were wrong: WHO may hold, and what
 * counts as ISSUING rather than SHOWING a token. Both were found by @neo-gpt-emmy running the
 * helper directly at review, which is the argument for this file existing.
 */
test.describe('mergeHoldTokens', () => {
    const
        hold = (login, createdAt, token = 'merge_hold') => ({login, createdAt, commentId: 1, token}),
        rev  = (login, submittedAt, state = 'APPROVED') => ({login, submittedAt, state}),
        T0   = '2026-07-29T07:00:00.000Z',
        T1   = '2026-07-29T09:00:00.000Z',
        T2   = '2026-07-29T11:00:00.000Z';

    test.describe('standing — the token confers no authority by itself', () => {
        test('a commenter with NO review is not a holder', () => {
            // The whole point: otherwise any drive-by comment blocks any PR. An earlier cut
            // returned `true` here, reading "no review yet" as "nothing has cleared it".
            expect(resolveMergeHold({comments: [hold('drive-by', T1)], reviews: []}).held).toBe(false);
        });

        test('a commenter who reviewed but never APPROVED is not a holder', () => {
            // A hold is the withdrawal of an approval. COMMENTED leaves nothing to withdraw.
            expect(resolveMergeHold({
                comments: [hold('peer-b', T1)],
                reviews : [rev('peer-b', T0, 'COMMENTED')]
            }).held).toBe(false);
        });

        test('an approval submitted AFTER the hold means the approval spoke last', () => {
            expect(resolveMergeHold({
                comments: [hold('peer-c', T1)],
                reviews : [rev('peer-c', T2)]
            }).held).toBe(false);
        });

        test('the live T1 specimen still holds — an approver who then posts a hold', () => {
            // Non-vacuity: the three arms above must not be satisfiable by disabling the feature.
            const verdict = resolveMergeHold({comments: [hold('peer-a', T1)], reviews: [rev('peer-a', T0)]});

            expect(verdict.held).toBe(true);
            expect(verdict.holders[0].login).toBe('peer-a');
        });
    });

    test.describe('clearing', () => {
        test('a newer submitted review from the SAME reviewer clears, in any state', () => {
            expect(resolveMergeHold({
                comments: [hold('peer-a', T1)],
                reviews : [rev('peer-a', T0), rev('peer-a', T2, 'CHANGES_REQUESTED')]
            }).held).toBe(false);
        });

        test('another peer never clears it', () => {
            expect(resolveMergeHold({
                comments: [hold('peer-a', T1)],
                reviews : [rev('peer-a', T0), rev('peer-z', T2)]
            }).held).toBe(true);
        });
    });

    test.describe('truncation degrades to unresolved, never to "no hold"', () => {
        test('an empty but truncated window is null, not false', () => {
            expect(resolveMergeHold({comments: [], reviews: [], truncated: true}).held).toBeNull();
        });

        test('a hold FOUND inside a truncated window is still decisive', () => {
            // A positive witness settles the question whatever lies beyond the window.
            expect(resolveMergeHold({
                comments : [hold('peer-a', T1)],
                reviews  : [rev('peer-a', T0)],
                truncated: true
            }).held).toBe(true);
        });
    });

    test.describe('issuance vs demonstration — code is an example, never a hold', () => {
        test('a token inside a fenced block is not an issuance', () => {
            // `merge-hold-tokens.md` opens a fence with this exact token in it. Without this, a
            // reviewer quoting the docs to explain the convention blocks the PR they explain it on.
            expect(mergeHoldToken('How it works:\n```\n[MERGE_HOLD] blocks the PR\n```\ndone')).toBeNull();
        });

        test('an info string on the fence does not re-admit it', () => {
            expect(mergeHoldToken('```md\n[MERGE_HOLD] example\n```')).toBeNull();
        });

        test('a tilde fence closes the same hole', () => {
            expect(mergeHoldToken('~~~\n[MERGE_HOLD] example\n~~~')).toBeNull();
        });

        test('an indented code block is a code block too', () => {
            expect(mergeHoldToken('Example:\n\n    [MERGE_HOLD] indented\n')).toBeNull();
        });

        test('a real issuance AFTER a closed fence still counts', () => {
            // The fence must TOGGLE, not swallow the remainder — otherwise the fix would silently
            // disable every hold posted below an example.
            expect(mergeHoldToken('```\nexample\n```\n[RE_REVIEW_HOLD] head moved')).toBe('re_review_hold');
        });

        test('the two issuance forms reviewers actually write still match', () => {
            expect(mergeHoldToken('[MERGE_HOLD] approval at T0 is not current')).toBe('merge_hold');
            expect(mergeHoldToken('## `[MERGE_HOLD]`\n\nrationale here')).toBe('merge_hold');
        });

        test('a mid-sentence mention is not an issuance', () => {
            expect(mergeHoldToken('No reason to hold this one — `[MERGE_HOLD]` would be overkill')).toBeNull();
        });
    });
});
