import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Coverage for `PullRequestService.managePrReviewers` — verifies it builds the REST
 * `requested_reviewers` command (needs only the `repo` scope) rather than the prior
 * `gh pr edit --add/remove-reviewer` path (which resolves logins via GraphQL → requires `read:org`,
 * a scope agent tokens routinely lack, so it failed for every agent on that credential class).
 *
 * The method exposes an `execFn` injection seam (default `execAsync`), so the command is captured
 * here without shelling out — mirroring the `buildCheckoutPullRequest` test-seam pattern.
 */
test.describe('PullRequestService.managePrReviewers — REST requested_reviewers', () => {
    let PullRequestService;

    test.beforeAll(async () => {
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
    });

    test('add → REST POST requested_reviewers (not gh pr edit), login @-stripped', async () => {
        let captured;
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['@neo-gpt'], action: 'add'},
            {execFn: async cmd => { captured = cmd; return {stdout: '{}'}; }}
        );

        expect(captured).toContain('pulls/42/requested_reviewers -X POST');
        expect(captured).toContain("-f 'reviewers[]=neo-gpt'");   // leading @ stripped
        expect(captured).not.toContain('gh pr edit');
        expect(captured).not.toContain('--add-reviewer');
        expect(res.message).toContain('requested');
    });

    test('remove → REST DELETE; team slugs are bare (no owner prefix)', async () => {
        let captured;
        await PullRequestService.managePrReviewers(
            {pr_number: 7, team_reviewers: ['core'], action: 'remove'},
            {execFn: async cmd => { captured = cmd; return {stdout: '{}'}; }}
        );

        expect(captured).toContain('pulls/7/requested_reviewers -X DELETE');
        expect(captured).toContain("-f 'team_reviewers[]=core'");
        expect(captured).not.toContain('neomjs/core');            // REST takes bare slugs, unlike gh pr edit
    });

    test('guards: unknown action + empty reviewer set', async () => {
        expect((await PullRequestService.managePrReviewers({pr_number: 1, action: 'nope', reviewers: ['x']})).code).toBe('INVALID_ARGUMENTS');
        expect((await PullRequestService.managePrReviewers({pr_number: 1, action: 'add'})).code).toBe('MISSING_ARGUMENTS');
    });
});
