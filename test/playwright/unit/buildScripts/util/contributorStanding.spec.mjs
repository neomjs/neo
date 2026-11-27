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
    claimLimit,
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
    // A Fleet app file: a sibling repository's `apps/` holds its own app, not the engine
    FLEET           = ['apps/agentos/util/SpineBanner.mjs'],
    INSTITUTION_URL = 'https://github.com/neomjs/neo-agent-institution',
    NEXT     = `**Next, if you want one:** #20701 (also \`grid\`) and #20702 are open and unclaimed; a comment on either claims it. [The full list](${LIST_URL}) has more if both are taken by then.`;

const BADGE_URL = 'https://neomjs.com/badges/outside-dev-4242/';

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

test.describe('buildScripts/util/contributorStanding', () => {
    test('the returning rung admits two curated claims, with invalid counts failing closed', () => {
        expect([0, 4, 5, 250].map(claimLimit)).toEqual([1, 1, 2, 2]);
        expect([undefined, null, NaN, Infinity, '5'].map(claimLimit)).toEqual([1, 1, 1, 1, 1])
    });

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

    test('the invitation follows what the pull request changed, and in which repository', () => {
        expect(invitation(ENGINE)).toBe(INVITATIONS.engine);
        expect(invitation(['resources/css/src/grid/Body.css', 'CONTRIBUTING.md'])).toBe(INVITATIONS.engine);
        expect(invitation(DOCS)).toBe(INVITATIONS.skills);
        expect(invitation([])).toBe(INVITATIONS.skills);
        expect(invitation(ENGINE, REPO_URL)).toBe(INVITATIONS.engine);
        // A sibling's app sits under `apps/` too, and is not the engine
        expect(invitation(FLEET, INSTITUTION_URL)).toBe(INVITATIONS.skills)
    });

    test.describe('decideMergeComment', () => {
        test('a first merge names the scheduled badge or the written folder in the full comment', () => {
            const line = badgeLine('Outside-Dev', 4242);
            for (const [folderWritten, badge] of [
                [false, `**Your badge**, if you would like to show it, is written by a scheduled run that has not counted this merge yet. From then on it is at ${BADGE_URL} in three forms to choose from, and the card's line shows it:\n\`${line}\``],
                [true, `**Your badge**, if you would like to show it, is at ${BADGE_URL} with three forms to choose from. The card's line:\n\`${line}\``]
            ]) {
                expect(comment(0, {folderWritten})).toBe([
                    'Merged. Thank you: this is your first merged pull request in Neo.mjs.',
                    '**Standing:** Contributor (1 merged). 4 more reach Returning Contributor.',
                    badge,
                    NEXT,
                    INVITATIONS.engine,
                    'A star helps others find the project.',
                    mergeMarker(20999)
                ].join('\n\n'))
            }
            expect(comment(0)).toBe(comment(0, {folderWritten: false}))
        });

        test('the returning rung announces the claim limit and links only a written badge', () => {
            for (const folderWritten of [false, true]) {
                const paragraphs = [
                    'Merged. Thank you: that makes 5 merged pull requests of yours in Neo.mjs.',
                    '**Standing:** Returning Contributor (5 merged). 5 more reach Bronze Contributor. You can now hold two curated claims at once in this repository.'
                ];
                if (folderWritten) paragraphs.push(`**Your badge** at ${BADGE_URL} shows the new rung once a scheduled run has counted this merge.`);
                paragraphs.push(NEXT, INVITATIONS.skills, 'A star helps others find the project.', mergeMarker(20999));
                expect(comment(4, {folderWritten, paths: DOCS})).toBe(paragraphs.join('\n\n'))
            }
            for (const earlier of [0, 3]) expect(comment(earlier)).not.toContain('You can now hold two curated claims');
            for (const later of [5, 9, 249]) expect(comment(later)).not.toContain('You can now hold two curated claims')
        });

        test('a merge between rungs links a written record on the standing line', () => {
            const standing = 'Merged. **Standing:** Returning Contributor (6 merged). 4 more reach Bronze Contributor.';
            for (const [folderWritten, line] of [[false, standing], [true, `${standing} Your record and badge: ${BADGE_URL}`]]) {
                expect(comment(5, {folderWritten})).toBe([line, NEXT, mergeMarker(20999)].join('\n\n'))
            }
        });

        test('badge wording never promises a duration, at or between any rungs', () => {
            for (const {merges} of RUNGS) {
                for (const before of [merges - 1, merges]) {
                    for (const folderWritten of [false, true]) {
                        expect(comment(before, {folderWritten})).not.toMatch(/\b(within|hours?|minutes?)\b/i)
                    }
                }
            }
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
            [0, 4, 5].forEach(before => expect(comment(before, {badgesSince: null, folderWritten: true})).not.toContain('badge'))
        });

        test('a merge older than the time the badges count from never names the badge, and a merge at that time is offered it', () => {
            // The merge in `pullRequest()` is at 2026-11-14T10:00:00Z
            expect(comment(0, {badgesSince: '2026-12-01T00:00:00Z'})).not.toContain('badge');
            expect(comment(4, {badgesSince: '2026-12-01T00:00:00Z'})).not.toContain('badge');
            expect(comment(0, {badgesSince: '2026-11-14T10:00:00Z'})).toContain('**Your badge**')
        });

        test('an account on the Pages opt-out list is offered no badge, and neither is anyone while the list is unknown', () => {
            expect(comment(0, {optOut: [990000004]})).toContain('**Your badge**');
            for (const before of [0, 4, 5]) {
                expect(comment(before, {optOut: [4242], folderWritten: true})).not.toContain('badge');
                expect(comment(before, {optOut: null, folderWritten: true})).not.toContain('badge')
            }
            // A caller that read no list offers no badge
            expect(decideMergeComment({mergedBefore: 0, pullRequest: pullRequest(), repoUrl: REPO_URL}).body).not.toContain('badge')
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
        const run = async ({author = {}, comments = [], eventName = 'pull_request_target', folderStatus = 404, incomplete = () => false, inputs, optOutText = '[]', paths = ENGINE, permission = 'read', repo = 'neo', searchError} = {}) => {
            const calls = {contents: [], inFlight: 0, info: [], peakSearches: 0, permissions: [], posted: [], queries: [], summary: [], warnings: []};

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
                        listFiles: async () => ({data: paths.map(filename => ({filename}))})
                    },
                    repos : {
                        // The author can read unless the arm passes a permission, and null answers Not Found
                        getCollaboratorPermissionLevel: async ({username}) => {
                            calls.permissions.push({searchesBefore: calls.queries.length, username});

                            if (permission === null) throw Object.assign(new Error('Not Found'), {status: 404});

                            return {data: {permission}}
                        },
                        getContent: async ({owner, repo, path: file, ref}) => {
                            calls.contents.push(`${owner}/${repo}@${ref}:${file}`);

                            if (file === 'badges/optout.json') {
                                if (optOutText === null) throw Object.assign(new Error('Not Found'), {status: 404});
                                return {data: {content: Buffer.from(optOutText).toString('base64'), encoding: 'base64'}}
                            }
                            if (file !== 'badges/outside-dev-4242') throw new Error(`Unexpected path: ${file}`);
                            if (folderStatus === 200) return {data: [{name: 'index.html', type: 'file'}]};
                            throw Object.assign(new Error(`Folder read returned ${folderStatus}`), {status: folderStatus})
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
                {eventName, payload: {inputs, pull_request: pullRequest(author)}, repo: {owner: 'neomjs', repo}},
                {info: message => calls.info.push(message), summary, warning: message => calls.warnings.push(message)}
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

        let fetchOutcome, workspace;

        test.beforeAll(() => {
            fetchOutcome                 = process.env.FETCH_OUTCOME;
            workspace                    = process.env.GITHUB_WORKSPACE;
            process.env.FETCH_OUTCOME    = 'success';
            process.env.GITHUB_WORKSPACE = process.cwd()
        });

        test.afterAll(() => {
            process.env.GITHUB_WORKSPACE = workspace;

            // Assigning undefined would store the string "undefined"
            if (fetchOutcome === undefined) {
                delete process.env.FETCH_OUTCOME
            } else {
                process.env.FETCH_OUTCOME = fetchOutcome
            }
        });

        test('it fetches only the two modules, from neomjs/neo at its own commit, and reads the payload in script only', () => {
            const shell = raw.split('run: |\n')[1].split('\n\n')[0];

            expect(raw).toMatch(/\non:\n  pull_request_target:\n    types: \[closed\]\n  workflow_call:\n  workflow_dispatch:/);
            expect(raw).not.toContain('actions/checkout');
            expect(raw).toContain('WORKFLOW_SHA: ${{ job.workflow_sha }}');
            expect(shell).toMatch(/\[\[ ! "\$WORKFLOW_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
            expect(shell).toMatch(/for module in claimResponse\.mjs contributorStanding\.mjs; do\n +gh api -H 'Accept: application\/vnd\.github\.raw' \\\n +"repos\/neomjs\/neo\/contents\/buildScripts\/util\/\$\{module\}\?ref=\$\{WORKFLOW_SHA\}"/);
            // The one shell step expands no expression: event data never reaches a shell
            expect(raw.match(/^\s+run:/gm)).toHaveLength(1);
            expect(shell).not.toContain('${{');
            expect(raw).not.toMatch(/^\s+ref:/m);
            expect(raw).toMatch(COMMENT_PERMISSIONS)
        });

        test('a sibling\'s call comments on its own pull request with its own next issues and invitation, from the same org-wide count and badge reads', async () => {
            const [calls, engine] = [await run({paths: FLEET, repo: 'neo-agent-institution'}), await run()];

            expect(calls.queries).toEqual([
                'org:neomjs is:public is:pr is:merged author:Outside-Dev merged:<2026-11-14T10:00:00Z',
                'repo:neomjs/neo-agent-institution is:issue is:open label:"good first issue" no:assignee -linked:pr',
                'repo:neomjs/neo-agent-institution is:issue is:open label:"help wanted" no:assignee -linked:pr'
            ]);
            expect(calls.contents).toEqual(['neomjs/pages@main:badges/optout.json', 'neomjs/pages@main:badges/outside-dev-4242']);
            expect(calls.posted).toHaveLength(1);
            expect(calls.posted[0]).toMatchObject({issue_number: 20999, owner: 'neomjs', repo: 'neo-agent-institution'});
            expect(calls.posted[0].body).toBe(comment(0, {paths: FLEET, repoUrl: INSTITUTION_URL}));
            // The words a Fleet author reads at a first merge, pinned apart from the renderer, against an Engine control
            expect(calls.posted[0].body).toContain('**Take it with you:**');
            expect(calls.posted[0].body).not.toContain('the engine you changed');
            expect(engine.posted[0].body).toContain('**See it run:** the engine you changed runs live in the browser');
            expect(calls.warnings).toEqual([])
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
                'org:neomjs is:public is:pr is:merged author:Outside-Dev merged:<2026-11-14T10:00:00Z',
                'repo:neomjs/neo is:issue is:open label:"good first issue" no:assignee -linked:pr',
                'repo:neomjs/neo is:issue is:open label:"help wanted" no:assignee -linked:pr'
            ]);
            // A plus sign reaches the search as a space: an offset of `+00:00` became the search term `00:00`
            expect(calls.queries.filter(query => query.includes('+'))).toEqual([]);
            expect(calls.info).toContain('Outside-Dev had 0 merged before #20999.');
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

        test('modules that fail to load warn and post nothing, and a failed fetch does not fail the job', async () => {
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

            expect(raw).toMatch(/id: fetch\n(?: +#.*\n)* +continue-on-error: true\n/)
        });

        test('a fetch that failed after writing both modules warns and posts nothing: the step\'s outcome decides, not the files', async () => {
            expect(raw).toMatch(/- name: Fetch the comment modules\n {8}id: fetch\n/);
            expect(raw).toContain('FETCH_OUTCOME: ${{ steps.fetch.outcome }}');

            process.env.FETCH_OUTCOME = 'failure';

            try {
                const calls = await run();

                expect(calls.queries).toEqual([]);
                expect(calls.posted).toEqual([]);
                expect(calls.warnings).toEqual(['No merge comment: the module fetch ended failure'])
            } finally {
                process.env.FETCH_OUTCOME = 'success'
            }
        });

        test('the folder read follows the opt-out read; a missing folder and a failed read still allow the comment', async () => {
            for (const status of [200, 404, 500]) {
                const result = await run({folderStatus: status});
                expect(result.contents).toEqual(['neomjs/pages@main:badges/optout.json', 'neomjs/pages@main:badges/outside-dev-4242']);
                expect(result.posted).toHaveLength(1);
                expect(result.posted[0].body).toBe(comment(0, {folderWritten: status === 200}));
                expect(result.warnings).toHaveLength(status === 500 ? 1 : 0)
            }
        });

        test('a refused folder name warns and still posts standing without a badge or a folder request', async () => {
            const calls = await run({author: {login: '-outside'}});
            expect(calls.contents).toEqual(['neomjs/pages@main:badges/optout.json']);
            expect(calls.posted).toHaveLength(1);
            expect(calls.posted[0].body).toContain('**Standing:** Contributor (1 merged).');
            expect(calls.posted[0].body).not.toContain('badge');
            expect(calls.warnings).toHaveLength(1)
        });

        test('a listed account, an unreadable opt-out list and disabled badges all skip the folder read', async () => {
            const [listed, missing, garbled] = [await run({optOutText: '[4242]'}), await run({optOutText: null}), await run({optOutText: '["4242"]'})];
            expect(listed.contents).toEqual(['neomjs/pages@main:badges/optout.json']);
            expect(listed.posted[0].body).toBe(comment(0, {optOut: [4242]}));
            expect(listed.posted[0].body).not.toContain('badge');
            expect(listed.warnings).toEqual([]);

            for (const unreadable of [missing, garbled]) {
                expect(unreadable.contents).toEqual(['neomjs/pages@main:badges/optout.json']);
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
});
