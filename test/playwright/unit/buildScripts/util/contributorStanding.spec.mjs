import fs             from 'node:fs';
import path           from 'node:path';
import {test, expect} from '@playwright/test';

import {
    BADGES_SINCE,
    INVITATIONS,
    RUNGS,
    badgeFolder,
    badgeLine,
    decideMergeComment,
    invitation,
    mergeMarker,
    nextIssues,
    standing
} from '../../../../../buildScripts/util/contributorStanding.mjs';

const
    REPO_URL = 'https://github.com/neomjs/neo',
    LIST_URL = `${REPO_URL}/issues?q=${encodeURIComponent('is:issue is:open no:assignee -linked:pr label:"good first issue","help wanted"')}`,
    LAUNCH   = '2026-12-01T00:00:00Z',
    ENGINE   = ['src/grid/Body.mjs'],
    DOCS     = ['learn/guides/Intro.md'];

/**
 * A REST-shaped pull request, merged and from an outside contributor unless told otherwise.
 */
const pullRequest = ({association = 'CONTRIBUTOR', login = 'Outside-Dev', merged = true, type = 'User'} = {}) => ({
    author_association: association,
    merged,
    merged_at         : '2026-11-14T10:00:00Z',
    number            : 20999,
    user              : {id: 4242, login, type}
});

const candidate = (number, ...labels) => ({number, labels: labels.map(name => ({name}))});

const CANDIDATES = [candidate(20701, 'good first issue', 'grid'), candidate(20702, 'help wanted', 'enhancement')];

/**
 * The comment for `mergedBefore` earlier merges, with two candidates and the merged work labelled `grid`.
 */
const comment = (mergedBefore, options = {}) => decideMergeComment({
    candidates  : CANDIDATES,
    closedLabels: ['grid', 'bug'],
    mergedBefore,
    paths       : ENGINE,
    pullRequest : pullRequest(),
    repoUrl     : REPO_URL,
    ...options
})?.body;

test.describe('buildScripts/util/contributorStanding', () => {
    test('the rungs are the published inventory, frozen', () => {
        expect(RUNGS.map(({slug, merges, name}) => `${slug} ${merges} ${name}`)).toEqual([
            'contributor 1 Contributor',
            'returning 5 Returning Contributor',
            'bronze 10 Bronze Contributor',
            'silver 25 Silver Contributor',
            'gold 50 Gold Contributor',
            'diamond 100 Diamond Contributor',
            'core 250 Core Contributor'
        ]);
        expect(Object.isFrozen(RUNGS) && RUNGS.every(Object.isFrozen)).toBe(true)
    });

    test('standing names the rung a count reaches and what the next one needs, at every boundary', () => {
        const at = count => {
            const {rung, next, remaining} = standing(count);

            return [count, rung?.slug ?? null, next?.slug ?? null, remaining]
        };

        expect([0, 1, 4, 5, 9, 10, 24, 25, 49, 50, 99, 100, 249, 250, 251].map(at)).toEqual([
            [0,   null,          'contributor', 1],
            [1,   'contributor', 'returning',   4],
            [4,   'contributor', 'returning',   1],
            [5,   'returning',   'bronze',      5],
            [9,   'returning',   'bronze',      1],
            [10,  'bronze',      'silver',      15],
            [24,  'bronze',      'silver',      1],
            [25,  'silver',      'gold',        25],
            [49,  'silver',      'gold',        1],
            [50,  'gold',        'diamond',     50],
            [99,  'gold',        'diamond',     1],
            [100, 'diamond',     'core',        150],
            [249, 'diamond',     'core',        1],
            [250, 'core',        null,          null],
            [251, 'core',        null,          null]
        ])
    });

    test('the badge line names the account by lowercase login and numeric id, in the card form, and its alt text names no rung', () => {
        expect(badgeFolder('Outside-Dev', 4242)).toBe('outside-dev-4242');
        expect(badgeLine('Outside-Dev', 4242)).toBe(
            '<a href="https://neomjs.com/badges/outside-dev-4242/"><img src="https://neomjs.com/badges/outside-dev-4242/card.svg" alt="Neo.mjs contributor"></a>'
        );
        expect(badgeLine('Outside-Dev', 4242, 'medal')).toContain('/outside-dev-4242/medal.svg')
    });

    test('nextIssues prefers an issue that shares a label with the merged work, and that label is its reason', () => {
        const candidates = [candidate(1, 'good first issue', 'enhancement'), candidate(2, 'help wanted', 'grid'), candidate(3, 'good first issue', 'ai')];

        expect(nextIssues({closedLabels: ['bug', 'grid', 'good first issue', 'ai'], candidates, seed: 'outside-dev'})[0]).toEqual({number: 2, reason: 'grid'});

        // The curated, type and `ai` labels say nothing about the work
        expect(nextIssues({closedLabels: ['enhancement', 'ai', 'good first issue'], candidates, seed: 'outside-dev'}).map(issue => issue.reason)).toEqual([null, null]);

        expect(nextIssues({candidates: [...candidates, candidate(2, 'grid')], seed: 'outside-dev'})).toHaveLength(2);
        expect(nextIssues({candidates: [], seed: 'outside-dev'})).toEqual([])
    });

    test('nextIssues rotates by login, so two contributors merged in the same hour are not sent to one issue', () => {
        const candidates = [1, 2, 3, 4, 5].map(number => candidate(number, 'good first issue'));

        expect(nextIssues({candidates, seed: 'alice'})[0].number).not.toBe(nextIssues({candidates, seed: 'bob'})[0].number)
    });

    test('the invitation follows what the pull request changed', () => {
        expect(invitation(ENGINE)).toBe(INVITATIONS.engine);
        expect(invitation(['resources/scss/src/grid/Body.scss', 'CONTRIBUTING.md'])).toBe(INVITATIONS.engine);
        expect(invitation(DOCS)).toBe(INVITATIONS.skills);
        expect(invitation([])).toBe(INVITATIONS.skills)
    });

    test.describe('decideMergeComment', () => {
        test('a first merge gets the full form', () => {
            expect(comment(0)).toBe([
                'Merged. Thank you: this is your first merged pull request in Neo.mjs.',
                '**Standing:** Contributor (1 merged). 4 more reach Returning Contributor.',
                `**Next, if you want one:** #20701 (also \`grid\`) and #20702 are open and unclaimed; a comment on either claims it. [The full list](${LIST_URL}) has more if both are taken by then.`,
                INVITATIONS.engine,
                'A star helps others find the project.',
                mergeMarker(20999)
            ].join('\n\n'))
        });

        test('a later rung gets the full form with the count, and no sentence promises a rule that has not shipped', () => {
            const body = comment(4, {paths: DOCS});

            expect(body).toContain('Merged. Thank you: that makes 5 merged pull requests of yours in Neo.mjs.');
            expect(body).toContain('**Standing:** Returning Contributor (5 merged). 5 more reach Bronze Contributor.');
            expect(body).toContain(INVITATIONS.skills);
            expect(body).not.toMatch(/claim.*at once/)
        });

        test('a merge between rungs gets standing and next issues only', () => {
            expect(comment(5)).toBe([
                'Merged. **Standing:** Returning Contributor (6 merged). 4 more reach Bronze Contributor.',
                `**Next, if you want one:** #20701 (also \`grid\`) and #20702 are open and unclaimed; a comment on either claims it. [The full list](${LIST_URL}) has more if both are taken by then.`,
                mergeMarker(20999)
            ].join('\n\n'))
        });

        test('the top rung names no next rung', () => {
            expect(comment(249)).toContain('**Standing:** Core Contributor (250 merged).\n\n');
            expect(comment(300)).toMatch(/^Merged\. \*\*Standing:\*\* Core Contributor \(301 merged\)\.\n\n/)
        });

        test('one candidate reads in the singular, and none leaves the paragraph out', () => {
            expect(comment(5, {candidates: [CANDIDATES[1]]})).toContain('#20702 is open and unclaimed; a comment on it claims it.');
            expect(comment(5, {candidates: []})).toBe(`Merged. **Standing:** Returning Contributor (6 merged). 4 more reach Bronze Contributor.\n\n${mergeMarker(20999)}`)
        });

        test('a bot, a team author or an unmerged pull request gets nothing', () => {
            const decide = pr => decideMergeComment({mergedBefore: 0, pullRequest: pr, repoUrl: REPO_URL});

            expect(decide(pullRequest({login: 'dependabot[bot]', type: 'Bot', association: 'CONTRIBUTOR'}))).toBeNull();
            expect(decide(pullRequest({association: 'MEMBER'}))).toBeNull();
            expect(decide(pullRequest({merged: false}))).toBeNull();
            expect(decide(pullRequest({association: 'FIRST_TIME_CONTRIBUTOR'}))).not.toBeNull()
        });

        test('a bot-authored marker stops a re-run, and a pasted one does not', () => {
            const marked = type => comment(0, {comments: [{body: `thanks ${mergeMarker(20999)}`, user: {login: 'someone', type}}]});

            expect(marked('Bot')).toBeUndefined();
            expect(marked('User')).toContain('Merged.')
        });

        test('while BADGES_SINCE is null no form mentions the badge', () => {
            expect(BADGES_SINCE).toBeNull();
            [0, 4, 5].forEach(before => expect(comment(before)).not.toContain('badge'))
        });

        test('once the badges are live, the first merge since then hands over the line in either form, and a later rung says the badge shows it', () => {
            const
                line    = '`<a href="https://neomjs.com/badges/outside-dev-4242/"><img src="https://neomjs.com/badges/outside-dev-4242/card.svg" alt="Neo.mjs contributor"></a>`',
                offered = '**Your badge**, if you would like to show it, exists within the hour at https://neomjs.com/badges/outside-dev-4242/ with three forms to choose from. The card\'s line:';

            expect(comment(0, {badgesSince: LAUNCH})).toContain(`**Standing:** Contributor (1 merged). 4 more reach Returning Contributor.\n\n${offered}\n${line}\n\n**Next`);
            expect(comment(6, {badgesSince: LAUNCH})).toContain(`Bronze Contributor.\n\n${offered}\n${line}\n\n**Next`);
            expect(comment(9, {badgesSince: LAUNCH, mergedSinceLaunchBefore: 2})).toContain('Bronze Contributor (10 merged). 15 more reach Silver Contributor.\n\nYour badge shows it within the hour.\n\n**Next');
            expect(comment(6, {badgesSince: LAUNCH, mergedSinceLaunchBefore: 1})).not.toContain('badge')
        });

        test('a count that is not one throws, so the workflow warns instead of posting a wrong standing', () => {
            expect(() => comment(undefined)).toThrow(TypeError);
            expect(() => comment(-1)).toThrow(TypeError)
        });
    });

    test.describe('.github/workflows/merge-comment.yml', () => {
        const
            raw           = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/merge-comment.yml'), 'utf8'),
            scriptBlock   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
            AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
            runStep       = new AsyncFunction('github', 'context', 'core', scriptBlock);

        /**
         * Runs the workflow's script against a stand-in GitHub, recording every query, post and warning.
         */
        const run = async ({comments = [], eventName = 'pull_request_target', inputs, searchError} = {}) => {
            const calls = {inFlight: 0, peakSearches: 0, posted: [], queries: [], summary: [], warnings: []};

            const github = {
                graphql : async () => ({repository: {pullRequest: {closingIssuesReferences: {nodes: [{labels: {nodes: [{name: 'grid'}]}}]}}}}),
                paginate: async fn => {
                    if (fn === github.rest.issues.listComments) return comments;
                    throw new Error('unexpected paginate target')
                },
                rest    : {
                    issues: {
                        createComment: async args => { calls.posted.push(args); return {data: {}} },
                        listComments : Symbol('listComments')
                    },
                    pulls : {
                        get      : async () => ({data: pullRequest()}),
                        listFiles: async () => ({data: ENGINE.map(filename => ({filename}))})
                    },
                    search: {
                        issuesAndPullRequests: async ({q}) => {
                            calls.queries.push(q);
                            calls.peakSearches = Math.max(calls.peakSearches, ++calls.inFlight);
                            // One microtask is enough for a concurrent caller to start its next search here
                            await null;
                            calls.inFlight--;

                            if (searchError) throw new Error(searchError);

                            return q.startsWith('org:')
                                ? {data: {total_count: 0, items: []}}
                                : {data: {items: q.includes('good first issue') ? [CANDIDATES[0]] : [CANDIDATES[1]]}}
                        }
                    }
                }
            };

            const summary = {
                addCodeBlock: text => { calls.summary.push(text); return summary },
                addHeading  : () => summary,
                write       : async () => summary
            };

            await runStep(
                github,
                {eventName, payload: {inputs, pull_request: pullRequest()}, repo: {owner: 'neomjs', repo: 'neo'}},
                {info: () => {}, summary, warning: message => calls.warnings.push(message)}
            );

            return calls
        };

        let workspace;

        test.beforeAll(() => {
            workspace                    = process.env.GITHUB_WORKSPACE;
            process.env.GITHUB_WORKSPACE = process.cwd()
        });

        test.afterAll(() => {
            process.env.GITHUB_WORKSPACE = workspace
        });

        test('it checks out only the two modules, never the head, and reads the payload in script only', () => {
            expect(raw).toMatch(/\non:\n  pull_request_target:\n    types: \[closed\]\n  workflow_dispatch:/);
            expect(raw).toMatch(/persist-credentials: false\n {10}sparse-checkout: \|\n {12}buildScripts\/util\/claimResponse\.mjs\n {12}buildScripts\/util\/contributorStanding\.mjs\n/);
            expect(raw).not.toMatch(/^\s+ref:/m);
            expect(raw).not.toMatch(/^\s+run:/m)
        });

        test('a merged outside pull request is commented on once, from a count that never waits for the index', async () => {
            const calls = await run();

            expect(calls.queries).toEqual([
                'org:neomjs is:pr is:merged author:Outside-Dev merged:<2026-11-14T10:00:00+00:00',
                'repo:neomjs/neo is:issue is:open label:"good first issue" no:assignee -linked:pr',
                'repo:neomjs/neo is:issue is:open label:"help wanted" no:assignee -linked:pr'
            ]);
            // GitHub's secondary rate limit refuses bursts of searches
            expect(calls.peakSearches).toBe(1);
            expect(calls.posted).toHaveLength(1);
            expect(calls.posted[0]).toMatchObject({issue_number: 20999, owner: 'neomjs', repo: 'neo'});
            expect(calls.posted[0].body).toBe(comment(0));
            expect(calls.warnings).toEqual([])
        });

        test('a re-run finds the bot-authored marker and posts nothing', async () => {
            const calls = await run({comments: [{body: mergeMarker(20999), user: {login: 'github-actions[bot]', type: 'Bot'}}]});

            expect(calls.posted).toEqual([]);
            expect(calls.warnings).toEqual([])
        });

        test('a failed query warns and ends green without posting', async () => {
            const calls = await run({searchError: 'secondary rate limit'});

            expect(calls.posted).toEqual([]);
            expect(calls.warnings).toEqual(['No merge comment: secondary rate limit'])
        });

        test('a dispatch renders into the job summary and posts only with post', async () => {
            const dryRun = await run({eventName: 'workflow_dispatch', inputs: {pr: '20999', post: 'false'}});

            expect(dryRun.posted).toEqual([]);
            expect(dryRun.summary).toEqual([comment(0)]);

            const posted = await run({eventName: 'workflow_dispatch', inputs: {pr: '20999', post: 'true'}});

            expect(posted.posted).toHaveLength(1)
        });
    });
});
