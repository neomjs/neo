import { test, expect }              from '@playwright/test';
import {assessMergedPullRequestPush} from '../../../../../buildScripts/util/mergedPullRequestPush.mjs';

/**
 * Coordinates lifted from a real occurrence: a pull request merged at one head while its
 * branch ref had already advanced past it, leaving the commits in between attached to no
 * pull request and covered by no CI run.
 */
const
    MERGED_HEAD   = 'ddf522a6feb4abf9faf4ad49af110d2a3a5c96b7',
    ADVANCED_HEAD = 'a993b72075411b321d50908687e6445b44599156',
    MERGE_COMMIT  = 'ad76ede9bfc8607314e98934e4ed2840629c23aa',
    mergedPr      = {number: 16255, state: 'MERGED', mergedAt: '2026-08-01T11:27:27Z', headRefOid: MERGED_HEAD};

test.describe('buildScripts/util/mergedPullRequestPush.assessMergedPullRequestPush (#16256)', () => {
    test('warns on the incident signature — merged PR, head beyond it, not yet in the base line', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : mergedPr,
            headSha            : ADVANCED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: true, status: 'unreached-commits'});
    });

    test('stays silent when the branch never had a pull request', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : null,
            headSha            : ADVANCED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: false, status: 'no-pull-request'});
    });

    test('stays silent on an open pull request — the common path adds no noise', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : {...mergedPr, state: 'OPEN', mergedAt: null},
            headSha            : ADVANCED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: false, status: 'pull-request-open'});
    });

    test('stays silent on a closed-unmerged pull request — its branch can still be reopened', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : {...mergedPr, state: 'CLOSED', mergedAt: null},
            headSha            : ADVANCED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: false, status: 'pull-request-not-merged'});
    });

    test('stays silent when head is exactly what the pull request merged (a re-push of merged work)', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : mergedPr,
            headSha            : MERGED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: false, status: 'head-matches-merged-head'});
    });

    test('compares the merged head case-insensitively rather than treating case as a divergence', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : {...mergedPr, headRefOid: MERGED_HEAD.toUpperCase()},
            headSha            : MERGED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: false, status: 'head-matches-merged-head'});
    });

    test('stays silent when everything on the branch is already contained in the base line', () => {
        expect(assessMergedPullRequestPush({
            pullRequest        : mergedPr,
            headSha            : ADVANCED_HEAD,
            headContainedInBase: true
        })).toEqual({warn: false, status: 'head-contained-in-base'});
    });

    test('does NOT key off the merge commit — under squash-merge it shares no ancestry with the head branch', () => {
        // Passing the base-line merge commit as the pull request's head coordinate must not
        // silence the guard: the incident head is still unreached work.
        expect(assessMergedPullRequestPush({
            pullRequest        : {...mergedPr, headRefOid: MERGE_COMMIT},
            headSha            : ADVANCED_HEAD,
            headContainedInBase: false
        })).toEqual({warn: true, status: 'unreached-commits'});
    });

    test.describe('fail toward pushing — every unresolvable input stays silent', () => {
        const unresolvable = [
            ['pull-request state missing',      {pullRequest: {...mergedPr, state: undefined},    headSha: ADVANCED_HEAD, headContainedInBase: false}, 'pull-request-unresolved'],
            ['pull-request state non-string',   {pullRequest: {...mergedPr, state: 7},            headSha: ADVANCED_HEAD, headContainedInBase: false}, 'pull-request-unresolved'],
            ['local head unreadable',           {pullRequest: mergedPr,                          headSha: null,          headContainedInBase: false}, 'coordinates-unresolved'],
            ['local head abbreviated',          {pullRequest: mergedPr,                          headSha: 'a993b72',     headContainedInBase: false}, 'coordinates-unresolved'],
            ['merged head missing from the PR', {pullRequest: {...mergedPr, headRefOid: null},    headSha: ADVANCED_HEAD, headContainedInBase: false}, 'coordinates-unresolved'],
            ['containment unknown (git errored)', {pullRequest: mergedPr,                        headSha: ADVANCED_HEAD, headContainedInBase: null},  'base-containment-unknown'],
            ['pull request is not an object',   {pullRequest: 'MERGED',                          headSha: ADVANCED_HEAD, headContainedInBase: false}, 'no-pull-request']
        ];

        for (const [label, args, status] of unresolvable) {
            test(`silent when ${label}`, () => {
                expect(assessMergedPullRequestPush(args)).toEqual({warn: false, status});
            });
        }

        test('the fallback cannot be flipped to blocking — the return shape has no block channel', () => {
            // AC: a test that fails if the fallback is ever flipped to blocking. `warn` is the
            // only actionable field the predicate can emit, so no input can request an exit.
            for (const [, args] of unresolvable) {
                const result = assessMergedPullRequestPush(args);
                expect(Object.keys(result).sort()).toEqual(['status', 'warn']);
                expect(result.warn).toBe(false);
            }
        });
    });
});
