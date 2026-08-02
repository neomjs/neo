import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Coverage for `PullRequestService.managePrReviewers` — verifies it builds the REST
 * `requested_reviewers` command (needs only the `repo` scope) rather than the prior
 * `gh pr edit --add/remove-reviewer` path (which resolves logins via GraphQL → requires `read:org`,
 * a scope agent tokens routinely lack, so it failed for every agent on that credential class), AND
 * that it reports the **effect** rather than the request.
 *
 * The method exposes an `execFn` injection seam (default `execAsync`), so the command is captured
 * here without shelling out — mirroring the `buildCheckoutPullRequest` test-seam pattern.
 *
 * The effect-verification cases exist because a false-success shipped past a suite that asserted only
 * the command string: `manage_pr_reviewers` echoed its own arguments back as success, so requesting a
 * nonexistent login reported "Successfully requested" while the PR kept zero reviewers.
 * Measured against the live API, GitHub accepts an unknown login, answers 200 with the full PR
 * object, and seats nobody — the exit code and the absence of an exception prove nothing. Fixtures
 * below therefore mirror the real 200 payload; a bare `{}` stub would reproduce the blind spot.
 */

/**
 * @summary Builds a `requested_reviewers` REST response in GitHub's real shape.
 * @param {String[]} [users=[]] Logins GitHub reports as seated.
 * @param {String[]} [teams=[]] Team slugs GitHub reports as seated.
 * @returns {Object} An `execFn`-shaped result whose `stdout` is the JSON payload.
 */
function reviewerResponse(users = [], teams = []) {
    return {stdout: JSON.stringify({
        number            : 42,
        // The endpoint answers with the whole PR object; these two arrays are the post-mutation truth.
        requested_reviewers: users.map((login, id) => ({login, id, type: 'User'})),
        requested_teams    : teams.map((slug,  id) => ({slug,  id, name: slug}))
    })};
}

test.describe('PullRequestService.managePrReviewers — REST requested_reviewers', () => {
    let PullRequestService;

    test.beforeAll(async () => {
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
    });

    test('add → REST POST requested_reviewers (not gh pr edit), login @-stripped', async () => {
        let captured;
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['@neo-gpt'], action: 'add'},
            {execFn: async cmd => { captured = cmd; return reviewerResponse(['neo-gpt']); }}
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
            {execFn: async cmd => { captured = cmd; return reviewerResponse(); }}
        );

        expect(captured).toContain('pulls/7/requested_reviewers -X DELETE');
        expect(captured).toContain("-f 'team_reviewers[]=core'");
        expect(captured).not.toContain('neomjs/core');            // REST takes bare slugs, unlike gh pr edit
    });

    test('guards: unknown action + empty reviewer set', async () => {
        expect((await PullRequestService.managePrReviewers({pr_number: 1, action: 'nope', reviewers: ['x']})).code).toBe('INVALID_ARGUMENTS');
        expect((await PullRequestService.managePrReviewers({pr_number: 1, action: 'add'})).code).toBe('MISSING_ARGUMENTS');
    });

    test('a nonexistent login must NOT report success (#16394)', async () => {
        // The live reproduction: GitHub returns 200 with an empty reviewer set, `gh` exits 0.
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 16385, reviewers: ['neo-gpt-euclid'], action: 'add'},
            {execFn: async () => reviewerResponse()}
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.error).toBeTruthy();
        expect(res.unseated).toEqual(['neo-gpt-euclid']);
        expect(res.message).toContain('neo-gpt-euclid');
        // The exact regression: the old code returned this string for the same response.
        expect(res.message).not.toContain('Successfully');
    });

    test('partial seating fails and names only the login that was not seated', async () => {
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 99, reviewers: ['neo-gpt', 'neo-gpt-euclid'], action: 'add'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.unseated).toEqual(['neo-gpt-euclid']);
        expect(res.unseated).not.toContain('neo-gpt');
        expect(res.verifiedReviewers).toEqual(['neo-gpt']);
    });

    test('an unseated team reviewer fails the same way', async () => {
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 99, team_reviewers: ['ghost-team'], action: 'add'},
            {execFn: async () => reviewerResponse([], [])}
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.unseated).toEqual(['ghost-team']);
    });

    test('verifiedReviewers comes from the response, never echoed from the arguments', async () => {
        // The falsifier for an echo: GitHub reports a reviewer that was never requested here
        // (seated by an earlier call). An implementation echoing its input cannot produce it.
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], team_reviewers: ['core'], action: 'add'},
            {execFn: async () => reviewerResponse(['neo-gpt', 'neo-opus-grace'], ['core'])}
        );

        expect(res.code).toBeUndefined();
        expect(res.verifiedReviewers).toContain('neo-opus-grace');
        expect(res.verifiedReviewers).toContain('neo-gpt');
        expect(res.verifiedTeamReviewers).toEqual(['core']);
        expect(res.message).toContain('Successfully');
    });

    test('login comparison is case-insensitive (GitHub seats logins case-folded)', async () => {
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['@Neo-GPT'], action: 'add'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}
        );

        // A case-sensitive compare would report a genuinely seated reviewer as unseated.
        expect(res.code).toBeUndefined();
        expect(res.message).toContain('Successfully');
    });

    test('remove verifies ABSENCE — a reviewer still present is a failure', async () => {
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'remove'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}   // still there → removal did not happen
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.unseated).toEqual(['neo-gpt']);
        expect(res.message).not.toContain('Successfully');
    });

    test('remove succeeds when the reviewer is gone from the returned state', async () => {
        const res = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'remove'},
            {execFn: async () => reviewerResponse(['neo-opus-grace'])}
        );

        expect(res.code).toBeUndefined();
        expect(res.message).toContain('removed');
        expect(res.verifiedReviewers).toEqual(['neo-opus-grace']);
    });

    test('an unverifiable response is a failure, not a success', async () => {
        // Missing arrays: proves nothing about who is seated. Treating absent as empty would
        // resurrect the false-success — and `{}` was the old fixture, so this pins it directly.
        const missing = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {execFn: async () => ({stdout: '{}'})}
        );

        expect(missing.code).toBe('REVIEWER_STATE_UNVERIFIABLE');
        expect(missing.message).not.toContain('Successfully');

        const unparseable = await PullRequestService.managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {execFn: async () => ({stdout: 'not json'})}
        );

        expect(unparseable.code).toBe('REVIEWER_STATE_UNVERIFIABLE');
        expect(unparseable.message).not.toContain('Successfully');
    });
});
