import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

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

/**
 * @summary Builds the source-owned PR coordinate read before an `add` reviewer mutation.
 * @param {Boolean|null} mergeable GitHub REST mergeability value.
 * @param {Object} [options]
 * @returns {Object} An `execFn`-shaped pull-request response.
 */
function mergeabilityResponse(mergeable, {
    headSha        = 'reviewed-head',
    baseSha        = 'current-dev',
    mergeableState = 'clean'
} = {}) {
    return {stdout: JSON.stringify({
        mergeable,
        mergeable_state: mergeableState,
        head           : {sha: headSha},
        base           : {sha: baseSha}
    })};
}

test.describe('PullRequestService.managePrReviewers — REST requested_reviewers', () => {
    let PullRequestService;

    /**
     * @summary Supplies positive mergeability by default while preserving each test's reviewer-mutation seam.
     * @param {Object} options Runtime method options.
     * @param {Object} [seams] Test seams.
     * @returns {Promise<Object>}
     */
    const managePrReviewers = (options, seams = {}) => {
        const {
            execFn                = async() => reviewerResponse(),
            mergeabilityResponses = [mergeabilityResponse(true)],
            onMergeabilityRead    = () => {},
            waitFn                = async() => {},
            ...dependencies
        } = seams;
        let mergeabilityIndex = 0;

        return PullRequestService.managePrReviewers(options, {
            ...dependencies,
            waitFn,
            execFn: async(command, config) => {
                if (command.includes('/requested_reviewers')) {
                    return execFn(command, config);
                }

                onMergeabilityRead(command);

                const response = mergeabilityResponses[Math.min(
                    mergeabilityIndex++,
                    mergeabilityResponses.length - 1
                )];

                if (response instanceof Error) throw response;

                return response;
            }
        });
    };

    test.beforeAll(async () => {
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
    });

    test('add → REST POST requested_reviewers (not gh pr edit), login @-stripped', async () => {
        let captured;
        const res = await managePrReviewers(
            {pr_number: 42, reviewers: ['@neo-gpt'], action: 'add'},
            {execFn: async cmd => { captured = cmd; return reviewerResponse(['neo-gpt']); }}
        );

        expect(captured).toContain('pulls/42/requested_reviewers -X POST');
        expect(captured).toContain("-f 'reviewers[]=neo-gpt'");   // leading @ stripped
        expect(captured).not.toContain('gh pr edit');
        expect(captured).not.toContain('--add-reviewer');
        expect(res.message).toContain('requested');
    });

    test('#17420: an explicit target qualifies the requested_reviewers REST path', async () => {
        let captured;

        await managePrReviewers(
            {repo: 'devindex', pr_number: 3, reviewers: ['neo-gpt'], action: 'add'},
            {execFn: async command => { captured = command; return reviewerResponse(['neo-gpt']) }}
        );

        expect(captured).toContain('gh api repos/neomjs/devindex/pulls/3/requested_reviewers');
        expect(captured).not.toContain('repos/neomjs/neo/pulls/3');
    });

    test('remove → REST DELETE; team slugs are bare (no owner prefix)', async () => {
        let captured;
        await managePrReviewers(
            {pr_number: 7, team_reviewers: ['core'], action: 'remove'},
            {execFn: async cmd => { captured = cmd; return reviewerResponse(); }}
        );

        expect(captured).toContain('pulls/7/requested_reviewers -X DELETE');
        expect(captured).toContain("-f 'team_reviewers[]=core'");
        expect(captured).not.toContain('neomjs/core');            // REST takes bare slugs, unlike gh pr edit
    });

    test('guards: unknown action + empty reviewer set', async () => {
        expect((await managePrReviewers({pr_number: 1, action: 'nope', reviewers: ['x']})).code).toBe('INVALID_ARGUMENTS');
        expect((await managePrReviewers({pr_number: 1, action: 'add'})).code).toBe('MISSING_ARGUMENTS');
    });

    test('#17692: confirmed conflict refuses add before the reviewer mutation', async () => {
        let mutationCalls = 0,
            mergeabilityCommand;
        const res = await managePrReviewers(
            {repo: 'devindex', pr_number: 17670, reviewers: ['neo-gpt'], action: 'add'},
            {
                execFn               : async() => { mutationCalls++; return reviewerResponse(['neo-gpt']) },
                mergeabilityResponses: [mergeabilityResponse(false, {
                    headSha       : 'conflicting-head',
                    baseSha       : 'moved-dev',
                    mergeableState: 'dirty'
                })],
                onMergeabilityRead: command => { mergeabilityCommand = command }
            }
        );

        expect(mergeabilityCommand).toBe('gh api repos/neomjs/devindex/pulls/17670');
        expect(mutationCalls).toBe(0);
        expect(res).toMatchObject({
            code                : 'PR_MERGE_CONFLICT',
            pr_number           : 17670,
            headSha             : 'conflicting-head',
            baseSha             : 'moved-dev',
            mergeabilityAttempts: 1
        });
        expect(res.message).toContain('Rebase or resolve conflicts');
    });

    test('#17692: unresolved null exhausts the bounded poll and never mutates', async () => {
        let   mutationCalls = 0;
        const delays        = [];
        const res           = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {
                execFn               : async() => { mutationCalls++; return reviewerResponse(['neo-gpt']) },
                mergeabilityResponses: Array.from({length: 4}, () => mergeabilityResponse(null)),
                waitFn               : async delay => { delays.push(delay) }
            }
        );

        expect(mutationCalls).toBe(0);
        expect(delays).toEqual([250, 500, 1000]);
        expect(res).toMatchObject({
            code                : 'PR_MERGEABILITY_UNAVAILABLE',
            mergeabilityAttempts: 4,
            headSha             : 'reviewed-head',
            baseSha             : 'current-dev'
        });
        expect(res.message).toContain('unavailable is not evidence');
    });

    test('#17692: an unreadable mergeability response is unavailable, never clean', async () => {
        let   mutationCalls = 0;
        const res           = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {
                execFn               : async() => { mutationCalls++; return reviewerResponse(['neo-gpt']) },
                mergeabilityResponses: [{stdout: '{}'}]
            }
        );

        expect(mutationCalls).toBe(0);
        expect(res.code).toBe('PR_MERGEABILITY_UNAVAILABLE');
        expect(res.mergeabilityAttempts).toBe(1);
        expect(res.headSha).toBeUndefined();
        expect(res.baseSha).toBeUndefined();
    });

    for (const mergeableState of ['blocked', 'behind', 'unstable']) {
        test(`#17692: positive mergeability remains admissible when mergeable_state=${mergeableState}`, async () => {
            let   mutationCalls = 0;
            const res           = await managePrReviewers(
                {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
                {
                    execFn               : async() => { mutationCalls++; return reviewerResponse(['neo-gpt']) },
                    mergeabilityResponses: [mergeabilityResponse(true, {mergeableState})]
                }
            );

            expect(mutationCalls).toBe(1);
            expect(res.code).toBeUndefined();
            expect(res.verifiedReviewers).toEqual(['neo-gpt']);
        });
    }

    test('#17692: remove stays available without any mergeability source read', async () => {
        let mergeabilityReads = 0,
            mutationCalls     = 0;
        const res = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'remove'},
            {
                execFn            : async() => { mutationCalls++; return reviewerResponse() },
                onMergeabilityRead: () => { mergeabilityReads++ }
            }
        );

        expect(mergeabilityReads).toBe(0);
        expect(mutationCalls).toBe(1);
        expect(res.code).toBeUndefined();
        expect(res.message).toContain('removed');
    });

    test('a nonexistent login must NOT report success (#16394)', async () => {
        // The live reproduction: GitHub returns 200 with an empty reviewer set, `gh` exits 0.
        const res = await managePrReviewers(
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
        const res = await managePrReviewers(
            {pr_number: 99, reviewers: ['neo-gpt', 'neo-gpt-euclid'], action: 'add'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.unseated).toEqual(['neo-gpt-euclid']);
        expect(res.unseated).not.toContain('neo-gpt');
        expect(res.verifiedReviewers).toEqual(['neo-gpt']);
    });

    test('an unseated team reviewer fails the same way', async () => {
        const res = await managePrReviewers(
            {pr_number: 99, team_reviewers: ['ghost-team'], action: 'add'},
            {execFn: async () => reviewerResponse([], [])}
        );

        expect(res.code).toBe('REVIEWER_NOT_SEATED');
        expect(res.unseated).toEqual(['ghost-team']);
    });

    test('verifiedReviewers comes from the response, never echoed from the arguments', async () => {
        // The falsifier for an echo: GitHub reports a reviewer that was never requested here
        // (seated by an earlier call). An implementation echoing its input cannot produce it.
        const res = await managePrReviewers(
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
        const res = await managePrReviewers(
            {pr_number: 42, reviewers: ['@Neo-GPT'], action: 'add'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}
        );

        // A case-sensitive compare would report a genuinely seated reviewer as unseated.
        expect(res.code).toBeUndefined();
        expect(res.message).toContain('Successfully');
    });

    test('remove verifies ABSENCE — a reviewer still present is a failure', async () => {
        const res = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'remove'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}   // still there → removal did not happen
        );

        expect(res.code).toBe('REVIEWER_STILL_REQUESTED');
        expect(res.unseated).toEqual(['neo-gpt']);
        expect(res.message).not.toContain('Successfully');
    });

    test('a failed remove describes the state GitHub returned, not the inverse', async () => {
        // The two actions fail into opposite observed states. A shared add-shaped envelope told the
        // caller of a failed REMOVE that the reviewer was "not seated" and sent them to check the
        // roster for a nonexistent login — while GitHub had just reported that exact login holding
        // the seat. Every assertion here is about the caller being routed at the real state.
        const removeFailed = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'remove'},
            {execFn: async () => reviewerResponse(['neo-gpt'])}
        );

        expect(removeFailed.error).toBe('Reviewer still requested');
        expect(removeFailed.message).toContain('remain requested reviewers');
        // The inverted claim and the remediation it implies — the actual defect, pinned by name.
        expect(removeFailed.error)  .not.toContain('not seated');
        expect(removeFailed.message).not.toContain('not seated');
        expect(removeFailed.message).not.toContain('identityRoots');
        expect(removeFailed.message).not.toContain('does not exist');
        // The seat is occupied; the caller must not read this as "free".
        expect(removeFailed.verifiedReviewers).toEqual(['neo-gpt']);

        // Positive control on the same axis: the add path must KEEP the roster remediation, or this
        // could have been "fixed" by deleting the guidance from both branches.
        const addFailed = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt-euclid'], action: 'add'},
            {execFn: async () => reviewerResponse([])}
        );

        expect(addFailed.code)   .toBe('REVIEWER_NOT_SEATED');
        expect(addFailed.error)  .toBe('Reviewer not seated');
        expect(addFailed.message).toContain('were not seated');
        expect(addFailed.message).toContain('identityRoots');

        // Neither envelope may state a status as the endpoint's general contract; the measured 200
        // belongs to the unknown-login receipt, and GitHub documents add as 201 / remove as 200.
        expect(removeFailed.message).not.toContain('HTTP 200');
        expect(addFailed   .message).not.toContain('HTTP 200');
    });

    test('remove succeeds when the reviewer is gone from the returned state', async () => {
        const res = await managePrReviewers(
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
        const missing = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {execFn: async () => ({stdout: '{}'})}
        );

        expect(missing.code).toBe('REVIEWER_STATE_UNVERIFIABLE');
        expect(missing.message).not.toContain('Successfully');

        const unparseable = await managePrReviewers(
            {pr_number: 42, reviewers: ['neo-gpt'], action: 'add'},
            {execFn: async () => ({stdout: 'not json'})}
        );

        expect(unparseable.code).toBe('REVIEWER_STATE_UNVERIFIABLE');
        expect(unparseable.message).not.toContain('Successfully');
    });

    test('the OpenAPI contract publishes what the runtime promises', async () => {
        // A tool description that promises verification fields is prose; the generated MCP contract is
        // what a client can actually discover. Before this, `ManagePrReviewersResponse` had no `required`
        // list — so `{}` satisfied the declared success schema — and the 422 pointed at the generic
        // `ErrorResponse`, which carries none of `pr_number` / `unseated` / the verified arrays.
        const doc     = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'), 'utf8')),
              schemas = doc.components.schemas,
              op      = Object.values(doc.paths).flatMap(p => Object.values(p)).find(o => o?.operationId === 'manage_pr_reviewers');

        expect(op, 'manage_pr_reviewers operation must exist').toBeTruthy();

        const okRef  = op.responses['200'].content['application/json'].schema.$ref,
              errRef = op.responses['422'].content['application/json'].schema.$ref;

        expect(okRef) .toBe('#/components/schemas/ManagePrReviewersResponse');
        expect(errRef).toBe('#/components/schemas/ManagePrReviewersErrorResponse');

        // Success: every verification field is REQUIRED, so an empty object no longer validates.
        expect(schemas.ManagePrReviewersResponse.required)
            .toEqual(expect.arrayContaining(['message', 'pr_number', 'verifiedReviewers', 'verifiedTeamReviewers']));

        // Failure: the structured fields are discoverable from the schema, not only from prose.
        const errSchema = schemas.ManagePrReviewersErrorResponse;

        expect(Object.keys(errSchema.properties))
            .toEqual(expect.arrayContaining([
                'code',
                'pr_number',
                'headSha',
                'baseSha',
                'mergeabilityAttempts',
                'unseated',
                'verifiedReviewers',
                'verifiedTeamReviewers'
            ]));
        expect(errSchema.required).toEqual(expect.arrayContaining(['error', 'message', 'code', 'pr_number']));
        // `unseated` and the verified arrays are deliberately NOT required: on
        // REVIEWER_STATE_UNVERIFIABLE the response carried no reviewer arrays, and publishing empty
        // ones would assert "GitHub reports nobody seated" — a definite claim about the unknown.
        expect(errSchema.required).not.toContain('unseated');
        expect(errSchema.required).not.toContain('headSha');

        // The lock that keeps this from rotting: every failure code the METHOD can return must appear
        // in the enum. A fourth code added to the service without a schema update fails here.
        const source  = fs.readFileSync(path.join(repoRoot, 'ai/services/github-workflow/PullRequestService.mjs'), 'utf8'),
              start   = source.indexOf('async managePrReviewers('),
              body    = source.slice(start, source.indexOf('\n    async ', start + 1) + 1 || undefined),
              runtime = [...new Set(body.match(/'((?:REVIEWER|PR)_[A-Z_]+)'/g) || [])].map(m => m.slice(1, -1));

        // Positive control: the slice must actually contain the method, or an empty `runtime` would
        // make the arrayContaining below pass while checking nothing.
        expect(start).toBeGreaterThan(-1);
        expect(runtime.length).toBeGreaterThanOrEqual(5);
        expect(errSchema.properties.code.enum).toEqual(expect.arrayContaining(runtime));
    });
});
