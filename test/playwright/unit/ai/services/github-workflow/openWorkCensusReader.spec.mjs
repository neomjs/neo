import {setup} from '../../../../setup.mjs';

const appName = 'OpenWorkCensusReaderTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * These readers are the census's source boundary. Their whole contract is that the source's own
 * `hasNextPage` survives to the walk unmodified, and that facts the source does not prove are not
 * invented here.
 */
test.describe('openWorkCensusReader — the source page boundary', () => {
    let makeOpenWorkCensusReader;

    const config = {owner: 'neomjs', repo: 'neo', maxLabels: 10, maxAssignees: 5, maxComments: 5, maxReviews: 5};

    // Captures the transport calls so the query/variables the source receives are assertable.
    const recordingQuery = response => {
        const calls = [];
        return {calls, query: async (queryString, variables) => { calls.push({queryString, variables}); return response }}
    };

    test.beforeAll(async () => {
        ({makeOpenWorkCensusReader} = await import('../../../../../../ai/services/github-workflow/openWorkCensusReader.mjs'))
    });

    test('an issues page carries real label + assignee evidence and the SOURCE end cursor', async () => {
        const {query, calls} = recordingQuery({
            repository: {
                issues: {
                    pageInfo: {hasNextPage: true, endCursor: 'CURSOR_1'},
                    nodes   : [{
                        number   : 15234,
                        title    : 'Add explore_lane_landscape',
                        state    : 'OPEN',
                        url      : 'https://github.com/neomjs/neo/issues/15234',
                        author   : {login: 'neo-opus-ada'},
                        labels   : {nodes: [{name: 'enhancement'}, {name: 'ai'}]},
                        assignees: {nodes: [{login: 'neo-opus-ada'}]}
                    }]
                }
            }
        });

        const {fetchIssuesPage} = makeOpenWorkCensusReader({query, config});
        const page              = await fetchIssuesPage({cursor: null, limit: 100});

        expect(page.items).toHaveLength(1);
        expect(page.items[0]).toMatchObject({
            number   : 15234,
            state    : 'OPEN',
            author   : 'neo-opus-ada',
            labels   : ['enhancement', 'ai'],
            assignees: ['neo-opus-ada']
        });
        // the source's own pagination truth reaches the walk unmodified
        expect(page.hasNextPage).toBe(true);
        expect(page.endCursor).toBe('CURSOR_1');
        // only OPEN work is censused, and the cursor is passed through to the source
        expect(calls[0].variables).toMatchObject({owner: 'neomjs', repo: 'neo', limit: 100, cursor: null, states: ['OPEN']});
        // the census reads the live no-filter path: filterBy:{assignee:null} is served stale (#15603; ticket-ref-ok: measured-quirk evidence ledger)
        expect(calls[0].queryString).not.toContain('filterBy');
    });

    test('hasNextPage is the SOURCE\'s answer, never inferred from a full or short page', async () => {
        // A full page that the source says is the last one must NOT read as "there is probably more",
        // and a short page the source says continues must NOT read as the end. Only the source decides.
        const full = recordingQuery({
            repository: {issues: {pageInfo: {hasNextPage: false, endCursor: 'X'}, nodes: [{number: 1}, {number: 2}]}}
        });
        const fullPage = await makeOpenWorkCensusReader({query: full.query, config}).fetchIssuesPage({cursor: null, limit: 2});

        expect(fullPage.items).toHaveLength(2);
        expect(fullPage.hasNextPage).toBe(false);

        const short = recordingQuery({
            repository: {issues: {pageInfo: {hasNextPage: true, endCursor: 'Y'}, nodes: [{number: 3}]}}
        });
        const shortPage = await makeOpenWorkCensusReader({query: short.query, config}).fetchIssuesPage({cursor: 'Y0', limit: 50});

        expect(shortPage.items).toHaveLength(1);
        expect(shortPage.hasNextPage).toBe(true);
    });

    test('a pull-request page reads authority from the source author and asserts no unproven facts', async () => {
        const {query, calls} = recordingQuery({
            repository: {
                pullRequests: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes   : [{
                        number: 15264,
                        title : 'feat(memory-core): explore_lane_landscape',
                        state : 'OPEN',
                        url   : 'https://github.com/neomjs/neo/pull/15264',
                        author: {login: 'neo-opus-ada'}
                    }]
                }
            }
        });

        const {fetchPullRequestsPage} = makeOpenWorkCensusReader({query, config});
        const page                    = await fetchPullRequestsPage({cursor: null, limit: 100});

        // the PR's owner is real source evidence — never an absence in a local projection
        expect(page.items[0]).toMatchObject({number: 15264, state: 'OPEN', author: 'neo-opus-ada', assignees: ['neo-opus-ada']});
        expect(page.hasNextPage).toBe(false);
        // the sync query is the one that can be walked; the list query selects no cursor at all
        expect(calls[0].queryString).toContain('$cursor');
        expect(calls[0].queryString).toContain('pageInfo');
    });

    test('an authorless PR is unowned rather than falsely attributed', async () => {
        const {query} = recordingQuery({
            repository: {pullRequests: {pageInfo: {hasNextPage: false}, nodes: [{number: 7, state: 'OPEN', author: null}]}}
        });

        const page = await makeOpenWorkCensusReader({query, config}).fetchPullRequestsPage({cursor: null, limit: 50});

        expect(page.items[0].author).toBeNull();
        expect(page.items[0].assignees).toEqual([]);
    });

    test('a missing connection yields an empty, non-exhausted-looking page rather than a crash', async () => {
        const {query} = recordingQuery({repository: {}});
        const page    = await makeOpenWorkCensusReader({query, config}).fetchIssuesPage({cursor: null, limit: 50});

        expect(page.items).toEqual([]);
        // absent pagination truth must never read as "the source confirmed the end"
        expect(page.hasNextPage).toBe(false);
        expect(page.endCursor).toBeNull();
    });

    test('fails LOUD on an unbound reader — a silent empty census is worse than a crash', () => {
        expect(() => makeOpenWorkCensusReader({config})).toThrow(/query/);
        expect(() => makeOpenWorkCensusReader({query: async () => ({})})).toThrow(/config/);
        expect(() => makeOpenWorkCensusReader({query: async () => ({}), config: {owner: 'neomjs'}})).toThrow(/repo/);
    });
});
