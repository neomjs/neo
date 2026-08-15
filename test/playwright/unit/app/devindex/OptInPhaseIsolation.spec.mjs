import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'DevIndexOptInPhaseIsolationTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';
import OptIn          from '../../../../../apps/devindex/services/OptIn.mjs';
import Storage        from '../../../../../apps/devindex/services/Storage.mjs';

/**
 * Opt-in has TWO independent intake mechanisms — stargazers and issues — reading the same
 * repository over different connections. GitHub restricted access at connection granularity: it
 * limited stargazer reads to repository admins and collaborators (announced 2026-06-30) while
 * leaving the issues connection readable.
 *
 * Before this fix the stargazer loop ran first and threw straight out of `run()`, so the readable
 * half never executed and opt-in intake went to ZERO rather than halving. The isolation must not
 * become suppression: a dead phase that reported success would leave the loss invisible, so every
 * test proving the issue path survived is paired with one proving the run still fails.
 */
test.describe.serial('DevIndex OptIn phase isolation (#17150)', () => {
    let calls,
        originalCloseIssues,
        originalGetBlocklist,
        originalGetOptInSync,
        originalGetTracker,
        originalQuery,
        originalRemoveFromBlocklist,
        originalRest,
        originalSaveOptInSync,
        originalUpdateTracker;

    /** One open issue nominating `issue-opted-in`, the shape `processIssues` parses. */
    const issuePayload = {
        repository: {
            issues: {
                pageInfo: {hasNextPage: false, endCursor: null},
                nodes   : [{
                    id    : 'I_kwDO',
                    number: 7,
                    body  : '### GitHub Usernames\nissue-opted-in\n',
                    author: {login: 'nominator'}
                }]
            }
        }
    };

    test.beforeEach(() => {
        originalCloseIssues         = OptIn.closeIssues;
        originalGetBlocklist        = Storage.getBlocklist;
        originalGetOptInSync        = Storage.getOptInSync;
        originalGetTracker          = Storage.getTracker;
        originalQuery               = GitHub.query;
        originalRemoveFromBlocklist = Storage.removeFromBlocklist;
        originalRest                = GitHub.rest;
        originalSaveOptInSync       = Storage.saveOptInSync;
        originalUpdateTracker       = Storage.updateTracker;

        calls = {queryLabels: [], tracked: []};

        Storage.getOptInSync        = async () => ({lastCheck: null});
        Storage.getBlocklist        = async () => new Set();
        Storage.getTracker          = async () => [];
        Storage.removeFromBlocklist = async () => {};
        Storage.saveOptInSync       = async () => {};
        Storage.updateTracker       = async updates => {calls.tracked.push(...updates.map(entry => entry.login))};
        GitHub.rest                 = async () => ({login: 'issue-opted-in'});
        OptIn.closeIssues           = async () => {}
    });

    test.afterEach(() => {
        GitHub.query                = originalQuery;
        GitHub.rest                 = originalRest;
        OptIn.closeIssues           = originalCloseIssues;
        Storage.getBlocklist        = originalGetBlocklist;
        Storage.getOptInSync        = originalGetOptInSync;
        Storage.getTracker          = originalGetTracker;
        Storage.removeFromBlocklist = originalRemoveFromBlocklist;
        Storage.saveOptInSync       = originalSaveOptInSync;
        Storage.updateTracker       = originalUpdateTracker
    });

    /** Fails the stargazer connection with `reason`; serves the issue connection normally. */
    function denyStargazers(reason) {
        GitHub.query = async (query, variables, retries, label) => {
            calls.queryLabels.push(label);

            if (label === 'OptIn Stars') {
                throw new Error(reason)
            }

            return issuePayload
        }
    }

    test('a denied stargazer read no longer prevents the issue path from running', async () => {
        // The exact production denial. Before the fix this threw out of `run()` and `processIssues`
        // was never reached, so the working half of opt-in died with the restricted half.
        denyStargazers('GraphQL Query Errors: Resource not accessible by integration');

        await expect(OptIn.run()).rejects.toThrow(/Resource not accessible by integration/);

        expect(calls.queryLabels).toContain('OptIn Stars');
        expect(calls.queryLabels, 'the issue phase must still be reached').toContain('OptIn Issues');
        // Not merely reached — its result was carried through to the tracker, so the surviving
        // mechanism genuinely still admits users rather than running and being discarded.
        expect(calls.tracked).toContain('issue-opted-in')
    });

    test('the run still FAILS after the issue path completes — isolation is not suppression', async () => {
        // Pinning the ordering, not just the outcome: the throw must come AFTER the issue work is
        // persisted. A rethrow placed earlier would restore the original defect while still
        // reporting the same error, and an assertion on the error alone could not tell them apart.
        denyStargazers('GraphQL Query Errors: Resource not accessible by integration');

        let threw = null;

        await OptIn.run().catch(error => {threw = error});

        expect(threw, 'a dead intake phase must never report success').toBeTruthy();
        expect(calls.tracked).toContain('issue-opted-in')
    });

    test('a missing opt-in repository ends the stargazer phase without pre-empting the issue phase', async () => {
        // This branch used to `return` out of `run()`. `processIssues` handles NOT_FOUND for itself
        // by returning null, so pre-empting it bought nothing and cost the other phase its turn.
        // Here the issue connection still answers, and the run completes without throwing.
        denyStargazers('NOT_FOUND: Could not resolve to a Repository');

        await expect(OptIn.run()).resolves.toBeUndefined();

        expect(calls.queryLabels).toContain('OptIn Issues');
        expect(calls.tracked).toContain('issue-opted-in')
    });

    test('collectStargazerOptIns reports the phase result rather than mutating run() state', async () => {
        // The extraction is what makes the isolation expressible: the phase returns its own result,
        // so the caller can lose it to a failure without leaving `run()` holding half-updated state.
        GitHub.query = async () => ({
            repository: {
                stargazers: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    edges   : [{starredAt: '2026-08-15T09:00:00Z', node: {login: 'star-opted-in'}}]
                }
            }
        });

        expect(await OptIn.collectStargazerOptIns(null)).toEqual({
            newLastCheck : '2026-08-15T09:00:00Z',
            optedInLogins: ['star-opted-in']
        })
    })
});
