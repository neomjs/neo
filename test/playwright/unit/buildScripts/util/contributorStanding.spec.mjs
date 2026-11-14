import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {test, expect} from '@playwright/test';

import {
    BADGES_SINCE,
    INVITATIONS,
    RUNGS,
    badgeFolder,
    badgeLine,
    decideHeadsUp,
    decideMergeComment,
    headsUpMarker,
    invitation,
    mergeMarker,
    nextIssues,
    parseOptOut,
    standing
} from '../../../../../buildScripts/util/contributorStanding.mjs';

import {TEAM_PERMISSIONS} from '../../../../../buildScripts/util/claimResponse.mjs';

const
    // A comment on a pull request needs the pull request's scope: GitHub refuses it under `issues: write`
    COMMENT_PERMISSIONS = /\npermissions:\n {2}contents: read .*\n {2}issues: read .*\n {2}pull-requests: write .*\n\njobs:/,
    REPO_URL = 'https://github.com/neomjs/neo',
    LIST_URL = `${REPO_URL}/issues?q=${encodeURIComponent('is:issue is:open no:assignee -linked:pr label:"good first issue","help wanted"')}`,
    ENGINE   = ['src/grid/Body.mjs'],
    DOCS     = ['learn/guides/Intro.md'],
    BOT      = {login: 'github-actions[bot]', type: 'Bot'},
    NEXT     = `**Next, if you want one:** #20701 (also \`grid\`) and #20702 are open and unclaimed; a comment on either claims it. [The full list](${LIST_URL}) has more if both are taken by then.`,
    OPT_OUT  = 'To be left out of the records, [open an issue in neomjs/pages](https://github.com/neomjs/pages/issues/new).';

/**
 * The paragraph that hands over the badge of the account in `pullRequest()`.
 */
const badgeParagraph = place => `**Your badge**, if you would like to show it, ${place} https://neomjs.com/badges/outside-dev-4242/ with three forms to choose from. The card's line:\n\`${badgeLine('Outside-Dev', 4242)}\``;

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
 * The comment for `mergedBefore` earlier merges, with two candidates, the merged work labelled `grid` and an empty
 * opt-out list.
 */
const comment = (mergedBefore, options = {}) => decideMergeComment({
    candidates  : CANDIDATES,
    closedLabels: ['grid', 'bug'],
    mergedBefore,
    optOut      : [],
    paths       : ENGINE,
    pullRequest : pullRequest(),
    repoUrl     : REPO_URL,
    ...options
})?.body;

/**
 * The heads-up for an account whose badge shows `count` merges, with the same pull request, candidates, labels, paths
 * and opt-out list as `comment()`.
 */
const headsUp = (count, options = {}) => decideHeadsUp({
    candidates  : CANDIDATES,
    closedLabels: ['grid', 'bug'],
    count,
    optOut      : [],
    paths       : ENGINE,
    pullRequest : pullRequest(),
    repoUrl     : REPO_URL,
    ...options
});

test.describe('buildScripts/util/contributorStanding', () => {
    test('the rungs are the published inventory, frozen: the badge art in neomjs/pages has a colour for each slug', () => {
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

    test('no line points at a folder the badge generator refuses: a login GitHub would not issue, or an id that is not a number', () => {
        expect(() => badgeFolder('dependabot[bot]', 49699333)).toThrow(TypeError);
        expect(() => badgeFolder('-outside', 4242)).toThrow(TypeError);
        expect(() => badgeFolder('outside-dev', 'x42')).toThrow(TypeError);
        expect(() => badgeFolder('outside-dev', undefined)).toThrow(TypeError);
        expect(badgeFolder('outside-dev', '4242')).toBe('outside-dev-4242')
    });

    test('the opt-out list reads as numeric account ids, and anything else as unknown', () => {
        expect(parseOptOut('[]')).toEqual([]);
        expect(parseOptOut('[990000004, 4242]')).toEqual([990000004, 4242]);

        ['', 'not json', 'null', '{"ids": [4242]}', '["4242"]', '[4242, null]', '[42.5]'].forEach(text => expect(parseOptOut(text)).toBeNull())
    });

    test('the module imports claimResponse.mjs and nothing else: its readers check out exactly those two files', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'buildScripts/util/contributorStanding.mjs'), 'utf8');

        expect([...source.matchAll(/^\s*import\b[^;]*?from\s+'([^']+)'/gm)].map(match => match[1])).toEqual(['./claimResponse.mjs']);
        expect(source).not.toMatch(/\bimport\s*\(/)
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
        test('a first merge gets the full form and is offered the badge', () => {
            expect(comment(0)).toBe([
                'Merged. Thank you: this is your first merged pull request in Neo.mjs.',
                '**Standing:** Contributor (1 merged). 4 more reach Returning Contributor.',
                badgeParagraph('exists within the hour at'),
                NEXT,
                INVITATIONS.engine,
                'A star helps others find the project.',
                mergeMarker(20999)
            ].join('\n\n'))
        });

        test('a later rung gets the full form with the count and says the badge shows it, and no sentence promises a rule that has not shipped', () => {
            const body = comment(4, {paths: DOCS});

            expect(body).toContain('Merged. Thank you: that makes 5 merged pull requests of yours in Neo.mjs.');
            expect(body).toContain('**Standing:** Returning Contributor (5 merged). 5 more reach Bronze Contributor.\n\nYour badge shows it within the hour.\n\n**Next');
            expect(body).toContain(INVITATIONS.skills);
            expect(body).not.toContain('**Your badge**');
            expect(body).not.toMatch(/claim.*at once/)
        });

        test('a merge between rungs gets standing and next issues only, and names no badge', () => {
            expect(comment(5)).toBe([
                'Merged. **Standing:** Returning Contributor (6 merged). 4 more reach Bronze Contributor.',
                NEXT,
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

        test('a bot-authored marker of either kind stops a re-run, and a pasted one does not', () => {
            const marked = (marker, type) => comment(0, {comments: [{body: `thanks ${marker}`, user: {login: 'someone', type}}]});

            for (const marker of [mergeMarker(20999), headsUpMarker(20999)]) {
                expect(marked(marker, 'Bot')).toBeUndefined();
                expect(marked(marker, 'User')).toContain('Merged.')
            }
        });

        test('the badges count from before the organisation\'s first pull request, and null switches them off', () => {
            // The organisation's first pull request was opened on 2019-11-11
            expect(BADGES_SINCE).toBe('2019-11-01T00:00:00Z');
            [0, 4, 5].forEach(before => expect(comment(before, {badgesSince: null})).not.toContain('badge'))
        });

        test('a merge older than the time the badges count from never names the badge, and a merge at that time is offered it', () => {
            // The merge in `pullRequest()` is at 2026-11-14T10:00:00Z
            expect(comment(0, {badgesSince: '2026-12-01T00:00:00Z'})).not.toContain('badge');
            expect(comment(4, {badgesSince: '2026-12-01T00:00:00Z'})).not.toContain('badge');
            expect(comment(0, {badgesSince: '2026-11-14T10:00:00Z'})).toContain('**Your badge**')
        });

        test('an account on the Pages opt-out list is offered no badge, and neither is anyone while the list is unknown', () => {
            expect(comment(0, {optOut: [990000004]})).toContain('**Your badge**');
            expect(comment(0, {optOut: [4242]})).not.toContain('badge');
            expect(comment(9, {optOut: [4242]})).not.toContain('badge');
            expect(comment(0, {optOut: null})).not.toContain('badge');
            // A caller that read no list offers no badge
            expect(decideMergeComment({mergedBefore: 0, pullRequest: pullRequest(), repoUrl: REPO_URL}).body).not.toContain('badge')
        });

        test('a count that is not one throws, so the workflow warns instead of posting a wrong standing', () => {
            expect(() => comment(undefined)).toThrow(TypeError);
            expect(() => comment(-1)).toThrow(TypeError)
        });
    });

    test.describe('decideHeadsUp', () => {
        const
            OPENING     = 'This pull request was merged before Neo.mjs kept a standing for its contributors. It does now, counted in merged pull requests, so here is yours.',
            CLOSING     = `This note comes once. From here on a comment arrives with each merge. ${OPT_OUT}`,
            byBot       = body => ({body, user: BOT}),
            withoutNext = `card.svg" alt="Neo.mjs contributor"></a>\`\n\n${INVITATIONS.engine}`;

        test('a pull request without a merge comment gets standing, badge, next issues and an invitation', () => {
            expect(headsUp(1)).toEqual({form: 'standing', body: [
                OPENING,
                '**Standing:** Contributor (1 merged). 4 more reach Returning Contributor.',
                badgeParagraph('is at'),
                NEXT,
                INVITATIONS.engine,
                CLOSING,
                headsUpMarker(20999)
            ].join('\n\n')})
        });

        test('the standing is the count the badge shows, between rungs and at the top rung, and the invitation follows the paths', () => {
            const between = headsUp(6, {paths: DOCS}).body;

            expect(between).toContain(`${OPENING}\n\n**Standing:** Returning Contributor (6 merged). 4 more reach Bronze Contributor.\n\n**Your badge**`);
            expect(between).toContain(`\n\n${INVITATIONS.skills}\n\n${CLOSING}`);
            expect(headsUp(250).body).toContain('**Standing:** Core Contributor (250 merged).\n\n**Your badge**')
        });

        test('one candidate reads in the singular, and none leaves the paragraph out', () => {
            expect(headsUp(1).body).not.toContain(withoutNext);
            expect(headsUp(1, {candidates: [CANDIDATES[1]]}).body).toContain('#20702 is open and unclaimed; a comment on it claims it.');
            expect(headsUp(1, {candidates: []}).body).toContain(withoutNext)
        });

        test('a merge comment that names no badge gets the badge alone, and one that names it gets nothing', () => {
            expect(headsUp(1, {comments: [byBot(comment(0, {badgesSince: null}))]})).toEqual({form: 'badge', body: [
                'Contributors to Neo.mjs now have a badge, and the comment above did not name yours.',
                badgeParagraph('is at'),
                OPT_OUT,
                headsUpMarker(20999)
            ].join('\n\n')});
            // A later rung says that the badge shows it, and a merge between rungs says nothing: neither hands the address over
            expect(headsUp(5, {comments: [byBot(comment(4))]}).form).toBe('badge');
            expect(headsUp(6, {comments: [byBot(comment(5))]}).form).toBe('badge');
            expect(headsUp(1, {comments: [byBot(comment(0))]})).toBeNull();
            // A pasted merge comment is none
            expect(headsUp(1, {comments: [{body: comment(0), user: {login: 'someone', type: 'User'}}]}).form).toBe('standing')
        });

        test('a bot-authored heads-up marker stops a second run, and a pasted one does not', () => {
            const marked = type => headsUp(1, {comments: [{body: `noted ${headsUpMarker(20999)}`, user: {login: 'someone', type}}]});

            expect(marked('Bot')).toBeNull();
            expect(marked('User').form).toBe('standing')
        });

        test('a bot, a team author, an unmerged pull request and an account without a badge folder get nothing', () => {
            expect(headsUp(1, {pullRequest: pullRequest({login: 'dependabot[bot]', type: 'Bot'})})).toBeNull();
            expect(headsUp(1, {pullRequest: pullRequest({association: 'MEMBER'})})).toBeNull();
            expect(headsUp(1, {pullRequest: pullRequest({merged: false})})).toBeNull();
            expect(headsUp(1, {optOut: [4242]})).toBeNull();
            expect(headsUp(1, {optOut: null})).toBeNull();
            expect(headsUp(1, {badgesSince: null})).toBeNull();
            // A caller that read no list tells nobody
            expect(decideHeadsUp({count: 1, pullRequest: pullRequest(), repoUrl: REPO_URL})).toBeNull()
        });

        test('a count below one throws, so the run lists the account instead of posting a wrong standing', () => {
            [0, -1, 1.5, undefined, '3'].forEach(count => expect(() => headsUp(count)).toThrow(TypeError))
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
        const run = async ({author = {}, comments = [], eventName = 'pull_request_target', incomplete = () => false, inputs, optOutText = '[]', permission = 'read', searchError} = {}) => {
            const calls = {contents: [], inFlight: 0, peakSearches: 0, permissions: [], posted: [], queries: [], summary: [], warnings: []};

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
                        get      : async () => ({data: pullRequest(author)}),
                        listFiles: async () => ({data: ENGINE.map(filename => ({filename}))})
                    },
                    repos : {
                        // The author can read unless the arm passes a permission, and null answers Not Found
                        getCollaboratorPermissionLevel: async ({username}) => {
                            calls.permissions.push({searchesBefore: calls.queries.length, username});

                            if (permission === null) throw Object.assign(new Error('Not Found'), {status: 404});

                            return {data: {permission}}
                        },
                        // The Pages opt-out list is empty unless the arm passes its text, and null answers Not Found
                        getContent: async ({owner, repo, path: file, ref}) => {
                            calls.contents.push(`${owner}/${repo}@${ref}:${file}`);

                            if (optOutText === null) throw Object.assign(new Error('Not Found'), {status: 404});

                            return {data: {content: Buffer.from(optOutText).toString('base64'), encoding: 'base64'}}
                        }
                    },
                    search: {
                        issuesAndPullRequests: async ({q}) => {
                            calls.queries.push(q);
                            calls.peakSearches = Math.max(calls.peakSearches, ++calls.inFlight);
                            // One microtask is enough for a concurrent caller to start its next search here
                            await null;
                            calls.inFlight--;

                            if (searchError) throw new Error(searchError);

                            const partial = incomplete(q) ? {incomplete_results: true} : {};

                            return q.startsWith('org:')
                                ? {data: {total_count: 0, items: [], ...partial}}
                                : {data: {items: q.includes('good first issue') ? [CANDIDATES[0]] : [CANDIDATES[1]], ...partial}}
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
                {eventName, payload: {inputs, pull_request: pullRequest(author)}, repo: {owner: 'neomjs', repo: 'neo'}},
                {info: () => {}, summary, warning: message => calls.warnings.push(message)}
            );

            return calls
        };

        /**
         * Runs `fn` in a workspace whose module has the badges switched off, so the script takes that path.
         */
        const switchedOff = async fn => {
            const
                dir    = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-comment-')),
                util   = path.join(dir, 'buildScripts/util'),
                source = fs.readFileSync(path.resolve(process.cwd(), 'buildScripts/util/contributorStanding.mjs'), 'utf8'),
                off    = source.replace(`export const BADGES_SINCE = '${BADGES_SINCE}';`, 'export const BADGES_SINCE = null;');

            expect(off).not.toBe(source);
            fs.mkdirSync(util, {recursive: true});
            fs.copyFileSync(path.resolve(process.cwd(), 'buildScripts/util/claimResponse.mjs'), path.join(util, 'claimResponse.mjs'));
            fs.writeFileSync(path.join(util, 'contributorStanding.mjs'), off);

            process.env.GITHUB_WORKSPACE = dir;

            try {
                return await fn()
            } finally {
                process.env.GITHUB_WORKSPACE = process.cwd();
                fs.rmSync(dir, {force: true, recursive: true})
            }
        };

        let checkoutOutcome, workspace;

        test.beforeAll(() => {
            checkoutOutcome              = process.env.CHECKOUT_OUTCOME;
            workspace                    = process.env.GITHUB_WORKSPACE;
            process.env.CHECKOUT_OUTCOME = 'success';
            process.env.GITHUB_WORKSPACE = process.cwd()
        });

        test.afterAll(() => {
            process.env.GITHUB_WORKSPACE = workspace;

            // Assigning undefined would store the string "undefined"
            if (checkoutOutcome === undefined) {
                delete process.env.CHECKOUT_OUTCOME
            } else {
                process.env.CHECKOUT_OUTCOME = checkoutOutcome
            }
        });

        test('it checks out only the two modules, never the head, and reads the payload in script only', () => {
            expect(raw).toMatch(/\non:\n  pull_request_target:\n    types: \[closed\]\n  workflow_dispatch:/);
            expect(raw).toMatch(/persist-credentials: false\n {10}sparse-checkout: \|\n {12}buildScripts\/util\/claimResponse\.mjs\n {12}buildScripts\/util\/contributorStanding\.mjs\n/);
            expect(raw).not.toMatch(/^\s+ref:/m);
            expect(raw).not.toMatch(/^\s+run:/m);
            expect(raw).toMatch(COMMENT_PERMISSIONS)
        });

        test('the team is whoever can write here: its author gets nothing and costs no search, at a merge and on a dispatch with post', async () => {
            for (const permission of TEAM_PERMISSIONS) {
                for (const calls of [await run({permission}), await run({eventName: 'workflow_dispatch', inputs: {pr: '20999', post: 'true'}, permission})]) {
                    expect(calls.permissions).toEqual([{searchesBefore: 0, username: 'Outside-Dev'}]);
                    expect(calls.queries).toEqual([]);
                    expect(calls.posted).toEqual([]);
                    expect(calls.summary).toEqual([]);
                    expect(calls.warnings).toEqual([])
                }
            }
        });

        test('an outside author is asked about once, before the first search, and a bot or a team association not at all', async () => {
            const outside = await run();

            expect(outside.permissions).toEqual([{searchesBefore: 0, username: 'Outside-Dev'}]);
            expect(outside.posted).toHaveLength(1);

            for (const calls of [await run({author: {type: 'Bot'}}), await run({author: {association: 'MEMBER'}})]) {
                expect(calls.permissions).toEqual([]);
                expect(calls.queries).toEqual([]);
                expect(calls.posted).toEqual([]);
                expect(calls.warnings).toEqual([])
            }
        });

        test('a permission that cannot be read, or that names none, warns and posts nothing', async () => {
            const [missing, unnamed] = [await run({permission: null}), await run({permission: 'owner'})];

            expect(missing.warnings).toEqual(['No merge comment: Not Found']);
            expect(unnamed.warnings).toEqual(['No merge comment: "owner" names no repository permission']);

            for (const calls of [missing, unnamed]) {
                expect(calls.queries).toEqual([]);
                expect(calls.posted).toEqual([]);
                expect(calls.summary).toEqual([])
            }
        });

        test('a merged outside pull request is commented on once, from a count that never waits for the index', async () => {
            const calls = await run();

            expect(calls.queries).toEqual([
                'org:neomjs is:public is:pr is:merged author:Outside-Dev merged:<2026-11-14T10:00:00+00:00',
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

        test('an incomplete search answer is no answer: a warning and no comment, for the count and for the candidates', async () => {
            for (const calls of [await run({incomplete: q => q.startsWith('org:')}), await run({incomplete: q => q.includes('help wanted')})]) {
                expect(calls.posted).toEqual([]);
                expect(calls.warnings).toEqual([expect.stringMatching(/^No merge comment: the search answered incompletely/)])
            }
        });

        test('modules that fail to load warn and post nothing, and a failed checkout does not fail the job', async () => {
            const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-comment-'));

            process.env.GITHUB_WORKSPACE = empty;

            try {
                const calls = await run();

                expect(calls.posted).toEqual([]);
                expect(calls.warnings).toEqual([expect.stringMatching(/^No merge comment: /)])
            } finally {
                process.env.GITHUB_WORKSPACE = process.cwd();
                fs.rmSync(empty, {force: true, recursive: true})
            }

            expect(raw).toMatch(/uses: actions\/checkout@v7\n(?: +#.*\n)* +continue-on-error: true\n/)
        });

        test('a checkout that failed after writing both modules warns and posts nothing: the step\'s outcome decides, not the files', async () => {
            expect(raw).toMatch(/- name: Check out the comment modules\n {8}id: checkout\n/);
            expect(raw).toContain('CHECKOUT_OUTCOME: ${{ steps.checkout.outcome }}');

            process.env.CHECKOUT_OUTCOME = 'failure';

            try {
                const calls = await run();

                expect(calls.queries).toEqual([]);
                expect(calls.posted).toEqual([]);
                expect(calls.warnings).toEqual(['No merge comment: the checkout ended failure'])
            } finally {
                process.env.CHECKOUT_OUTCOME = 'success'
            }
        });

        test('the Pages opt-out list decides the badge: an empty list offers it, a listed account and an unreadable list do not, and with the badges switched off it is not read', async () => {
            const [open, listed, missing, garbled] = [await run(), await run({optOutText: '[4242]'}), await run({optOutText: null}), await run({optOutText: '["4242"]'})];

            expect(open.contents).toEqual(['neomjs/pages@main:badges/optout.json']);
            expect(open.posted[0].body).toContain('**Your badge**');
            expect(open.warnings).toEqual([]);

            expect(listed.posted[0].body).toBe(comment(0, {optOut: [4242]}));
            expect(listed.posted[0].body).not.toContain('badge');
            expect(listed.warnings).toEqual([]);

            for (const unreadable of [missing, garbled]) {
                expect(unreadable.posted[0].body).toBe(comment(0, {optOut: null}));
                expect(unreadable.warnings).toEqual(['No badge in the merge comment: the opt-out list of neomjs/pages is unreadable.'])
            }

            const off = await switchedOff(() => run());

            expect(off.contents).toEqual([]);
            expect(off.posted[0].body).toBe(comment(0, {badgesSince: null}));
            expect(off.warnings).toEqual([])
        });

        test('a dispatch renders into the job summary and posts only with post', async () => {
            const dryRun = await run({eventName: 'workflow_dispatch', inputs: {pr: '20999', post: 'false'}});

            expect(dryRun.posted).toEqual([]);
            expect(dryRun.summary).toEqual([comment(0)]);

            const posted = await run({eventName: 'workflow_dispatch', inputs: {pr: '20999', post: 'true'}});

            expect(posted.posted).toHaveLength(1)
        });
    });

    test.describe('.github/workflows/contributor-heads-up.yml', () => {
        const
            raw           = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/contributor-heads-up.yml'), 'utf8'),
            scriptBlock   = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
            AsyncFunction = Object.getPrototypeOf(async function () {}).constructor,
            // The script's timer is a parameter here, so a replay records each wait and sits none out
            runStep       = new AsyncFunction('github', 'context', 'core', 'setTimeout', scriptBlock);

        const
            account = (id, login, count) => ({count, firstMerge: '2024-01-01T00:00:00Z', id, logins: [login]}),
            merge   = (number, id, login, mergedAt, association = 'CONTRIBUTOR') => ({
                author_association: association,
                number,
                pull_request      : {merged_at: mergedAt},
                user              : {id, login, type: 'User'}
            });

        // Six accounts, out of order. 101, 102 and 106 have a merge here that was never told of a badge, 103 was told,
        // 104 joined the team and 105 no longer answers.
        const
            LEDGER = [account(103, 'gamma', 2), account(101, 'alpha', 2), account(106, 'zeta', 1), account(102, 'beta', 6), account(104, 'delta', 3), account(105, 'gone', 1)],
            MERGES = {
                alpha: [merge(10, 101, 'alpha', '2023-03-01T00:00:00Z'), merge(11, 101, 'alpha', '2024-03-01T00:00:00Z')],
                beta : [merge(12, 102, 'beta', '2026-11-14T15:00:00Z')],
                gamma: [merge(13, 103, 'gamma', '2025-01-01T00:00:00Z')],
                delta: [merge(14, 104, 'delta', '2025-02-01T00:00:00Z', 'MEMBER')],
                zeta : [merge(16, 106, 'zeta', '2025-06-01T00:00:00Z')]
            },
            COMMENTS = {
                12: [{body: `Merged. **Standing:** Returning Contributor (6 merged).\n\n${mergeMarker(12)}`, user: BOT}],
                13: [{body: headsUpMarker(13), user: BOT}]
            },
            link     = number => `<a href="${REPO_URL}/pull/${number}">#${number}</a>`;

        /**
         * The note the run renders for `item`, the latest merge of an account whose badge shows `count`.
         */
        const note = (item, count) => decideHeadsUp({
            candidates  : CANDIDATES,
            closedLabels: ['grid'],
            comments    : COMMENTS[item.number],
            count,
            optOut      : [],
            paths       : ENGINE,
            pullRequest : {author_association: item.author_association, merged: true, merged_at: item.pull_request.merged_at, number: item.number, user: item.user},
            repoUrl     : REPO_URL
        }).body;

        /**
         * Runs the workflow's script against a stand-in GitHub, recording every search, wait, post, table and failure.
         */
        const run = async ({comments = COMMENTS, inputs = {}, ledgerText = JSON.stringify({accounts: LEDGER}), limited = {}, listed = {}, optOutText = '[]', refuse, users = {}} = {}) => {
            const calls = {failed: [], inFlight: 0, peakSearches: 0, posted: [], queries: [], rendered: [], tables: [], waits: [], warnings: []},
                  // How often GitHub still refuses the search for a login, as `{<login>: {times, retryAfter}}`
                  refusals = structuredClone(limited);

            const github = {
                graphql : async () => ({repository: {pullRequest: {closingIssuesReferences: {nodes: [{labels: {nodes: [{name: 'grid'}]}}]}}}}),
                paginate: async (fn, {issue_number}) => {
                    if (fn === github.rest.issues.listComments) return comments[issue_number] || [];
                    throw new Error('unexpected paginate target')
                },
                request : async (route, {account_id}) => {
                    const login = users[account_id] || LEDGER.find(entry => entry.id === account_id)?.logins[0];

                    if (route !== 'GET /user/{account_id}' || !login || login === 'gone') throw Object.assign(new Error('Not Found'), {status: 404});

                    return {data: {id: account_id, login, type: 'User'}}
                },
                rest    : {
                    issues: {
                        createComment: async args => {
                            if (args.issue_number === refuse) throw new Error('secondary rate limit');

                            calls.posted.push(args);
                            return {data: {}}
                        },
                        listComments : Symbol('listComments')
                    },
                    pulls: {listFiles: async () => ({data: ENGINE.map(filename => ({filename}))})},
                    repos: {
                        getContent: async ({path: file}) => {
                            const text = file === 'badges/ledger.json' ? ledgerText : optOutText;

                            if (text === null) throw Object.assign(new Error('Not Found'), {status: 404});

                            return {data: {content: Buffer.from(text).toString('base64'), encoding: 'base64'}}
                        }
                    },
                    search: {
                        issuesAndPullRequests: async ({q}) => {
                            calls.queries.push(q);
                            calls.peakSearches = Math.max(calls.peakSearches, ++calls.inFlight);
                            // One microtask is enough for a concurrent caller to start its next search here
                            await null;
                            calls.inFlight--;

                            if (q.includes('is:issue')) return {data: {items: q.includes('good first issue') ? [CANDIDATES[0]] : [CANDIDATES[1]]}};

                            const login = q.split('author:')[1],
                                  items = MERGES[login] || [];

                            if (refusals[login]?.times > 0) {
                                refusals[login].times--;

                                throw Object.assign(new Error('You have exceeded a secondary rate limit.'), {
                                    response: {headers: refusals[login].retryAfter ? {'retry-after': refusals[login].retryAfter} : {}},
                                    status  : 403
                                })
                            }

                            return {data: {items, total_count: listed[login] ?? items.length}}
                        }
                    }
                }
            };

            const summary = {
                addCodeBlock: text => { calls.rendered.push(text); return summary },
                addHeading  : () => summary,
                addRaw      : () => summary,
                addTable    : rows => { calls.tables.push(rows.slice(1).map(row => row.map(cell => cell.data))); return summary },
                write       : async () => summary
            };

            await runStep(
                github,
                {payload: {inputs}, repo: {owner: 'neomjs', repo: 'neo'}},
                {info: () => {}, setFailed: message => calls.failed.push(message), summary, warning: message => calls.warnings.push(message)},
                (resolve, ms) => { calls.waits.push(ms); resolve() }
            );

            return calls
        };

        let workspace;

        test.beforeAll(() => {
            workspace                    = process.env.GITHUB_WORKSPACE;
            process.env.GITHUB_WORKSPACE = process.cwd()
        });

        test.afterAll(() => {
            // Assigning undefined would store the string "undefined"
            if (workspace === undefined) {
                delete process.env.GITHUB_WORKSPACE
            } else {
                process.env.GITHUB_WORKSPACE = workspace
            }
        });

        test('it runs by hand only, checks out only the two modules and reads its inputs in script only', () => {
            expect(raw.split('\non:\n')[1].split('\n\n')[0].split('\n').filter(line => /^ {2}\S/.test(line))).toEqual(['  workflow_dispatch:']);
            expect(raw).toMatch(/persist-credentials: false\n {10}sparse-checkout: \|\n {12}buildScripts\/util\/claimResponse\.mjs\n {12}buildScripts\/util\/contributorStanding\.mjs\n/);
            expect(raw).not.toMatch(/^\s+ref:/m);
            expect(raw).not.toMatch(/^\s+run:/m);
            // No expression anywhere: an input reaches the job through the script's context alone
            expect(raw).not.toContain('${{');
            expect(raw).toMatch(COMMENT_PERMISSIONS)
        });

        test('a run without post posts nothing and renders every note, on the latest outside merge of each account', async () => {
            const calls = await run();

            expect(calls.posted).toEqual([]);
            expect(calls.failed).toEqual([]);
            expect(calls.rendered).toEqual([note(MERGES.alpha[1], 2), note(MERGES.beta[0], 6), note(MERGES.zeta[0], 1)]);
            expect(calls.tables).toEqual([
                [['would post', '3'], ['already told', '1'], ['no outside pull request in this repository', '1'], ['failed', '1']],
                [
                    ['101', link(11), 'Contributor (2)', 'standing', 'would post'],
                    ['102', link(12), 'Returning Contributor (6)', 'badge', 'would post'],
                    ['103', link(13), '', '', 'already told'],
                    ['104', '', '', '', 'no outside pull request in this repository'],
                    ['105', '', '', '', 'failed: Not Found'],
                    ['106', link(16), 'Contributor (1)', 'standing', 'would post']
                ]
            ]);
            expect(calls.warnings).toEqual(['Account 105: Not Found'])
        });

        test('searches run one at a time and 4 s apart: one per curated label, then one per account that answers', async () => {
            const calls = await run();

            expect(calls.queries).toEqual([
                'repo:neomjs/neo is:issue is:open label:"good first issue" no:assignee -linked:pr',
                'repo:neomjs/neo is:issue is:open label:"help wanted" no:assignee -linked:pr',
                ...['alpha', 'beta', 'gamma', 'delta', 'zeta'].map(login => `repo:neomjs/neo is:pr is:merged author:${login}`)
            ]);
            expect(calls.peakSearches).toBe(1);
            expect(calls.waits).toHaveLength(calls.queries.length - 1);
            // The wait is 4,000 ms less the time since the search before, which is next to nothing against a stand-in
            calls.waits.forEach(ms => expect(ms > 3400 && ms <= 4000).toBe(true))
        });

        test('a search GitHub refuses for a rate limit waits as long as it asks, or 65 s, and is tried again; after three more tries the account is listed and the run goes on', async () => {
            const
                gaps   = waits => waits.filter(ms => ms > 4000),
                asked  = await run({limited: {alpha: {retryAfter: '7', times: 1}}}),
                unsaid = await run({limited: {alpha: {times: 2}}}),
                given  = await run({inputs: {post: 'true'}, limited: {alpha: {times: 4}}});

            expect(gaps(asked.waits)).toEqual([7000]);
            expect(asked.queries.filter(q => q.endsWith('author:alpha'))).toHaveLength(2);
            expect(asked.rendered[0]).toBe(note(MERGES.alpha[1], 2));
            expect(asked.warnings).toEqual(['Account 105: Not Found']);

            expect(gaps(unsaid.waits)).toEqual([65000, 65000]);
            expect(unsaid.rendered[0]).toBe(note(MERGES.alpha[1], 2));

            expect(gaps(given.waits)).toEqual([65000, 65000, 65000]);
            expect(given.queries.filter(q => q.endsWith('author:alpha'))).toHaveLength(4);
            expect(given.warnings[0]).toBe('Account 101: You have exceeded a secondary rate limit.');
            expect(given.posted.map(args => args.issue_number)).toEqual([12, 16])
        });

        test('with post it posts each note once, limit stops it after that many, and a second run tells nobody twice', async () => {
            const limited = await run({inputs: {limit: '2', post: 'true'}});

            expect(limited.posted).toEqual([
                {body: note(MERGES.alpha[1], 2), issue_number: 11, owner: 'neomjs', repo: 'neo'},
                {body: note(MERGES.beta[0], 6), issue_number: 12, owner: 'neomjs', repo: 'neo'}
            ]);
            expect(limited.tables[1].map(row => row[4])).toEqual(['posted', 'posted']);

            const
                first  = await run({inputs: {post: 'true'}}),
                told   = Object.fromEntries(first.posted.map(({body, issue_number}) => [issue_number, [...(COMMENTS[issue_number] || []), {body, user: BOT}]])),
                second = await run({comments: {...COMMENTS, ...told}, inputs: {post: 'true'}});

            expect(first.posted.map(args => args.issue_number)).toEqual([11, 12, 16]);
            expect(second.posted).toEqual([]);
            expect(second.tables[0]).toEqual([['already told', '4'], ['no outside pull request in this repository', '1'], ['failed', '1']])
        });

        test('an unreadable ledger or opt-out list posts nothing and searches nothing', async () => {
            for (const unreadable of [{ledgerText: null}, {ledgerText: 'not json'}, {ledgerText: '{}'}, {optOutText: null}, {optOutText: '["101"]'}]) {
                const calls = await run({inputs: {post: 'true'}, ...unreadable});

                expect(calls.posted).toEqual([]);
                expect(calls.queries).toEqual([]);
                expect(calls.failed).toEqual(['Nothing posted: the ledger or the opt-out list of neomjs/pages is unreadable.'])
            }
        });

        test('an account in skip is listed and left out, and one on the opt-out list is not listed at all', async () => {
            const calls = await run({inputs: {post: 'true', skip: '101, 106'}, optOutText: '[102]'});

            expect(calls.posted).toEqual([]);
            expect(calls.tables[1].map(row => [row[0], row[4]])).toEqual([
                ['101', 'skipped'],
                ['103', 'already told'],
                ['104', 'no outside pull request in this repository'],
                ['105', 'failed: Not Found'],
                ['106', 'skipped']
            ])
        });

        test('an account is passed over when the ledger does not hold its login or its merges fill more than a page', async () => {
            const calls = await run({inputs: {post: 'true'}, listed: {alpha: 101}, users: {106: 'zeta-new'}});

            expect(calls.posted.map(args => args.issue_number)).toEqual([12]);
            expect(calls.warnings).toEqual([
                'Account 101: 101 merged pull requests, more than one page',
                'Account 105: Not Found',
                'Account 106: renamed to zeta-new since its badge was written'
            ])
        });

        test('a refused post stops the run, so a limit on new content is not pushed against', async () => {
            const calls = await run({inputs: {post: 'true'}, refuse: 12});

            expect(calls.posted.map(args => args.issue_number)).toEqual([11]);
            expect(calls.failed).toEqual(['Stopped at account 102: the post to #12 failed (secondary rate limit). A second run tells nobody twice.']);
            expect(calls.tables[1].map(row => row[4])).toEqual(['posted', 'failed: secondary rate limit'])
        });
    });
});
