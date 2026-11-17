import fs             from 'node:fs';
import path           from 'node:path';
import {test, expect} from '@playwright/test';

import {
    CLAIM_WINDOW_DAYS,
    overlapMarker,
    releaseMarker,
    replyMarker
} from '../../../../../buildScripts/util/claimResponse.mjs';

const
    DAY_MS        = 24 * 60 * 60 * 1000,
    WORKFLOW_PATH = path.resolve(process.cwd(), '.github/workflows/claim-responder.yml');

/**
 * @summary Builds a fixture GitHub issue object for curated claim-responder pagination tests.
 * @param {Object} [options]
 * @returns {Object}
 */
function curatedIssue({assignees = [], labels = [{name: 'help wanted'}], number = 19143, state = 'open', userLogin = 'maintainer'} = {}) {
    return {assignees, labels, number, state, user: {login: userLogin}};
}

/**
 * @summary Builds a fixture GitHub issue comment object.
 * @param {String} login
 * @param {String} createdAt
 * @param {String} body
 * @param {Object} [options]
 * @returns {Object}
 */
function issueComment(login, createdAt, body, {association = 'NONE', id, type = 'User', userId} = {}) {
    return {
        author_association: association,
        body,
        created_at        : createdAt,
        id                : id ?? Date.parse(createdAt),
        user              : {id: userId ?? (type === 'Bot' ? 1 : 9000), login, type}
    };
}

/**
 * @summary Loads the live JavaScript step from `.github/workflows/claim-responder.yml` and wires mocked GitHub I/O around it.
 * @param {Object} [options]
 * @returns {Object}
 */
function createWorkflowHarness({
    assignedRepoItems = () => [],
    createCommentHook = null,
    graphqlHandler,
    issueEvents       = new Map(),
    issueComments     = new Map(),
    issues            = new Map(),
    mergedCount       = 0,
    permission        = () => 'read',
    prComments        = new Map(),
    pullDetails       = new Map(),
    searchCandidates  = () => []
} = {}) {
    const
        raw          = fs.readFileSync(WORKFLOW_PATH, 'utf8'),
        script       = raw.split('script: |\n')[1].split('\n').map(line => line.slice(12)).join('\n'),
        run          = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', script),
        assigned     = [],
        created      = [],
        graphqlCalls = [],
        unassigned   = [],
        updated      = [],
        warnings     = [];

    const github = {
        graphql: async (query, vars) => {
            graphqlCalls.push({query, vars});
            return graphqlHandler(vars, graphqlCalls.length)
        },
        paginate: async (fn, args) => {
            if (fn === github.rest.issues.listComments) {
                return args.issue_number >= 21500
                    ? [...(prComments.get(args.issue_number) || [])]
                    : [...(issueComments.get(args.issue_number) || [])]
            }
            if (fn === github.rest.issues.listEvents) return [...(issueEvents.get(args.issue_number) || [])];
            if (fn === github.rest.issues.listForRepo) return assignedRepoItems(args);
            throw new Error('unexpected paginate call')
        },
        rest: {
            issues: {
                addAssignees   : async args => {
                    assigned.push(args);
                    const target = issues.get(args.issue_number);
                    target.assignees = [...(target.assignees || []), ...args.assignees.map(login => ({login}))];
                    return {data: target}
                },
                createComment  : async args => {
                    if (createCommentHook) await createCommentHook(args);
                    created.push(args);
                    const entry = issueComment('github-actions[bot]', '2026-11-16T02:10:05Z', args.body, {type: 'Bot'});
                    if (args.issue_number >= 21500) {
                        prComments.set(args.issue_number, [...(prComments.get(args.issue_number) || []), entry])
                    } else {
                        issueComments.set(args.issue_number, [...(issueComments.get(args.issue_number) || []), entry])
                    }
                    return {data: entry}
                },
                get            : async ({issue_number}) => ({data: issues.get(issue_number)}),
                listComments   : Symbol('listComments'),
                listEvents     : Symbol('listEvents'),
                listForRepo    : Symbol('listForRepo'),
                removeAssignees: async args => { unassigned.push(args); return {data: {}} },
                updateComment  : async args => { updated.push(args); return {data: {}} }
            },
            pulls: {
                get: async ({pull_number}) => ({data: pullDetails.get(pull_number)})
            },
            repos: {
                getCollaboratorPermissionLevel: async ({username}) => ({data: {permission: permission(username)}})
            },
            search: {
                issuesAndPullRequests: async ({q}) => q.startsWith('org:')
                    ? {data: {incomplete_results: false, total_count: mergedCount}}
                    : {data: {items: searchCandidates().map(number => ({number}))}}
            }
        }
    };

    const
        core        = {info: () => {}, warning: message => warnings.push(message)},
        prevWorkdir = process.env.GITHUB_WORKSPACE;

    const execute = async (eventName, payload) => {
        process.env.GITHUB_WORKSPACE = process.cwd();
        try {
            await run(github, {eventName, payload, repo: {owner: 'neomjs', repo: 'neo'}}, core)
        } finally {
            if (prevWorkdir === undefined) delete process.env.GITHUB_WORKSPACE;
            else process.env.GITHUB_WORKSPACE = prevWorkdir
        }
    };

    return {assigned, created, execute, graphqlCalls, unassigned, updated, warnings}
}

/**
 * @summary Builds a fork-only linked PR node stub to populate earlier GraphQL pages.
 * @param {Number} index
 * @param {Boolean} [includeClosed=false]
 * @returns {Object}
 */
function forkRef(index, includeClosed = false) {
    return {
        author    : {login: `fork-user-${index}`},
        ...(includeClosed ? {merged: false} : {}),
        number    : 100 + index,
        repository: {nameWithOwner: `fork-user-${index}/neo`},
        state     : includeClosed && index % 2 === 0 ? 'CLOSED' : 'OPEN'
    }
}

test.describe('claim-responder linked-PR pagination and whole-event preflight (#21086)', () => {
    test('AC-1: comment claimant receives held reply and zero assignment when upstream holder sits on page 2 or page 3', async () => {
        const
            claim  = issueComment('newcomer', '2026-11-16T02:00:00Z', "I'd love to work on this."),
            page1  = Array.from({length: 50}, (_, index) => forkRef(index + 1)),
            holder = {author: {login: 'upstream-holder'}, number: 21999, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'};

        const twoPage = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({number: 19143})]]),
            issueComments : new Map([[19143, [claim]]]),
            graphqlHandler: ({after, first, includeClosedPrs}) => {
                expect(first).toBe(50);
                expect(includeClosedPrs).toBe(false);
                if (after === null) {
                    return {repository: {issue: {closedByPullRequestsReferences: {nodes: page1, pageInfo: {endCursor: 'cursor-p1', hasNextPage: true}}}}}
                }
                if (after === 'cursor-1' || after === 'cursor-p1') {
                    return {repository: {issue: {closedByPullRequestsReferences: {nodes: [holder], pageInfo: {endCursor: null, hasNextPage: false}}}}}
                }
                throw new Error(`Unexpected cursor ${after}`)
            }
        });

        await twoPage.execute('issue_comment', {comment: claim, issue: {number: 19143}});
        expect(twoPage.graphqlCalls.map(call => call.vars.after)).toEqual([null, 'cursor-p1']);
        expect(twoPage.assigned).toEqual([]);
        expect(twoPage.created).toHaveLength(1);
        expect(twoPage.created[0].body).toContain('#21999');
        expect(twoPage.created[0].body).toContain('This one is taken');
        expect(twoPage.created[0].body).not.toContain('Assigned to you');

        // 3-page chain also resolves holder on page 3 cleanly
        const threePage = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({number: 19143})]]),
            issueComments : new Map([[19143, [claim]]]),
            graphqlHandler: ({after}) => {
                if (after === null) return {repository: {issue: {closedByPullRequestsReferences: {nodes: page1, pageInfo: {endCursor: 'c1', hasNextPage: true}}}}};
                if (after === 'c1') return {repository: {issue: {closedByPullRequestsReferences: {nodes: [forkRef(51)], pageInfo: {endCursor: 'c2', hasNextPage: true}}}}};
                if (after === 'c2') return {repository: {issue: {closedByPullRequestsReferences: {nodes: [holder], pageInfo: {endCursor: 'c3', hasNextPage: false}}}}};
                throw new Error(`Unexpected cursor ${after}`)
            }
        });

        await threePage.execute('issue_comment', {comment: claim, issue: {number: 19143}});
        expect(threePage.graphqlCalls.map(call => call.vars.after)).toEqual([null, 'c1', 'c2']);
        expect(threePage.assigned).toEqual([]);
        expect(threePage.created[0].body).toContain('#21999');
    });

    test('AC-2: missing/malformed pagination metadata, non-advancing cursors, and page failures stop both handlers with zero writes', async () => {
        const
            claim = issueComment('newcomer', '2026-11-16T02:00:00Z', '/claim'),
            pr    = {
                author_association: 'NONE',
                body              : 'Resolves #19143',
                created_at        : '2026-11-16T02:00:00Z',
                number            : 21500,
                user              : {id: 7001, login: 'outside-dev', type: 'User'}
            },
            badResponses = [
                () => ({repository: {issue: {}}}),
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: 'invalid', pageInfo: {hasNextPage: false}}}}}),
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}),
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: 'false'}}}}}),
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [forkRef(1)], pageInfo: {hasNextPage: true}}}}}),
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {endCursor: 'c1', hasNextPage: true}}}}}),
                ({after}) => after === null
                    ? {repository: {issue: {closedByPullRequestsReferences: {nodes: [forkRef(1)], pageInfo: {endCursor: 'same', hasNextPage: true}}}}}
                    : {repository: {issue: {closedByPullRequestsReferences: {nodes: [forkRef(2)], pageInfo: {endCursor: 'same', hasNextPage: true}}}}},
                () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [{number: 'bad', state: 'OPEN'}], pageInfo: {hasNextPage: false}}}}}),
                ({after}) => {
                    if (after === null) {
                        return {repository: {issue: {closedByPullRequestsReferences: {nodes: [forkRef(1)], pageInfo: {endCursor: 'c1', hasNextPage: true}}}}}
                    }
                    throw new Error('GitHub GraphQL page-2 outage')
                }
            ];

        for (const graphqlHandler of badResponses) {
            const commentRun = createWorkflowHarness({
                issues       : new Map([[19143, curatedIssue({number: 19143})]]),
                issueComments: new Map([[19143, [claim]]]),
                graphqlHandler
            });

            await expect(commentRun.execute('issue_comment', {comment: claim, issue: {number: 19143}}))
                .rejects.toThrow(/Incomplete state read/);
            expect(commentRun.assigned).toEqual([]);
            expect(commentRun.unassigned).toEqual([]);
            expect(commentRun.created).toEqual([]);
            expect(commentRun.updated).toEqual([]);

            const prRun = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})]]),
                graphqlHandler: (vars, call) => graphqlHandler(vars, call)
            });

            await expect(prRun.execute('pull_request_target', {action: 'opened', pull_request: pr}))
                .rejects.toThrow(/Incomplete state read/);
            expect(prRun.assigned).toEqual([]);
            expect(prRun.unassigned).toEqual([]);
            expect(prRun.created).toEqual([]);
            expect(prRun.updated).toEqual([]);
        }
    });

    test('AC-2: pull_request_target preflights every added/removed target before any assignment or unassignment writes', async () => {
        const
            pr = {
                author_association: 'NONE',
                body              : 'Resolves #20691',
                created_at        : '2026-11-16T02:00:00Z',
                number            : 21500,
                user              : {id: 7001, login: 'outside-dev', type: 'User'}
            },
            issueA = curatedIssue({assignees: [{login: 'outside-dev'}], number: 19143}),
            issueB = curatedIssue({number: 20691}),
            events = new Map([[19143, [{
                actor     : {login: 'github-actions[bot]', type: 'Bot'},
                assignee  : {login: 'outside-dev'},
                created_at: '2026-11-16T01:55:00Z',
                event     : 'assigned'
            }]]]);

        // 1. Retarget from valid held target issue A to incomplete page-2 target issue B performs ZERO unassign on A
        const retargetFail = createWorkflowHarness({
            issues        : new Map([[19143, issueA], [20691, issueB]]),
            issueEvents   : events,
            graphqlHandler: ({after, number}) => {
                if (number === 19143) {
                    return {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {endCursor: null, hasNextPage: false}}}}}
                }
                if (number === 20691 && after === null) {
                    return {
                        repository: {
                            issue: {
                                closedByPullRequestsReferences: {
                                    nodes   : Array.from({length: 50}, (_, index) => forkRef(index + 1, true)),
                                    pageInfo: {endCursor: 'p1', hasNextPage: true}
                                }
                            }
                        }
                    }
                }
                throw new Error('page 2 failed for #20691')
            }
        });

        await expect(retargetFail.execute('pull_request_target', {
            action      : 'edited',
            changes     : {body: {from: 'Resolves #19143'}},
            pull_request: pr
        })).rejects.toThrow(/Incomplete state read for #20691/);
        expect(retargetFail.unassigned).toEqual([]);
        expect(retargetFail.assigned).toEqual([]);
        expect(retargetFail.created).toEqual([]);

        // 2. Opening a PR targeting a free first issue (valid empty) and a second issue (missing pageInfo) assigns NEITHER issue
        const twoTargetFail = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
            graphqlHandler: ({number}) => number === 19143
                ? {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {endCursor: null, hasNextPage: false}}}}}
                : {repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}
        });

        await expect(twoTargetFail.execute('pull_request_target', {
            action      : 'opened',
            pull_request: {...pr, body: 'Resolves #19143\nResolves #20691'}
        })).rejects.toThrow(/Incomplete state read for #20691/);
        expect(twoTargetFail.assigned).toEqual([]);
        expect(twoTargetFail.unassigned).toEqual([]);
        expect(twoTargetFail.created).toEqual([]);

        // 3. Multi-page upstream holder on page 2 for pull_request_target triggers overlap notice with zero assignments
        const multiPagePr = createWorkflowHarness({
            issues        : new Map([[20691, curatedIssue({number: 20691})]]),
            graphqlHandler: ({after, includeClosedPrs}) => {
                expect(includeClosedPrs).toBe(true);
                if (after === null) {
                    return {
                        repository: {
                            issue: {
                                closedByPullRequestsReferences: {
                                    nodes   : Array.from({length: 50}, (_, index) => forkRef(index + 1, true)),
                                    pageInfo: {endCursor: 'p1', hasNextPage: true}
                                }
                            }
                        }
                    }
                }
                return {
                    repository: {
                        issue: {
                            closedByPullRequestsReferences: {
                                nodes   : [{author: {login: 'earlier-dev'}, merged: false, number: 21400, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}],
                                pageInfo: {endCursor: null, hasNextPage: false}
                            }
                        }
                    }
                }
            }
        });

        await multiPagePr.execute('pull_request_target', {action: 'opened', pull_request: pr});
        expect(multiPagePr.assigned).toEqual([]);
        expect(multiPagePr.created).toHaveLength(1);
        expect(multiPagePr.created[0].body).toContain(overlapMarker({heldBy: 'pr:21400', issue: 20691, pr: 21500}));

        // 4. Unmerged PR closing two targets warns and posts zero release notices if the second target has incomplete metadata
        const prevReleaseSince = process.env.NEO_CLAIM_RELEASE_SINCE;
        process.env.NEO_CLAIM_RELEASE_SINCE = '2026-11-15T00:00:00Z';
        try {
            const
                displaced = issueComment('displaced-dev', '2026-11-16T02:02:00Z', '/claim', {id: 8002}),
                refusal   = issueComment('github-actions[bot]', '2026-11-16T02:02:05Z',
                    `This one is taken.\n\n${replyMarker('displaced-dev')}\n<!-- claim-refused:8002 -->`,
                    {type: 'Bot'}),
                closeFail = createWorkflowHarness({
                    issues        : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
                    issueComments : new Map([[19143, [displaced, refusal]]]),
                    graphqlHandler: ({number}) => number === 19143
                        ? {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}
                        : {repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}
                });

            await closeFail.execute('pull_request_target', {
                action      : 'closed',
                pull_request: {...pr, body: 'Resolves #19143\nResolves #20691', closed_at: '2026-11-16T02:10:00Z', merged: false}
            });
            expect(closeFail.created).toEqual([]);
            expect(closeFail.warnings).toHaveLength(1);
            expect(closeFail.warnings[0]).toMatch(/Incomplete state read for #20691/)
        } finally {
            if (prevReleaseSince === undefined) delete process.env.NEO_CLAIM_RELEASE_SINCE;
            else process.env.NEO_CLAIM_RELEASE_SINCE = prevReleaseSince
        }
    });

    test('AC-2/AC-3: valid empty and null-redacted pages keep allowing valid claims and preserve core safeguards', async () => {
        // Both claims are fixed: staleness compares their two times, never the clock
        const
            freshAt = '2026-11-16T02:00:00Z',
            staleAt = new Date(Date.parse(freshAt) - (CLAIM_WINDOW_DAYS + 1) * DAY_MS).toISOString(),
            stale   = issueComment('StaleDev', staleAt, '/claim', {id: 4001}),
            fresh   = issueComment('newcomer', freshAt, '/claim', {id: 4002});

        // Empty complete result + redacted private cross-repo null node permits lapsed handover claim
        const emptyComment = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({assignees: [{login: 'StaleDev'}], number: 19143})]]),
            issueComments : new Map([[19143, [stale, fresh]]]),
            graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [null], pageInfo: {endCursor: null, hasNextPage: false}}}}})
        });

        await emptyComment.execute('issue_comment', {comment: fresh, issue: {number: 19143}});
        expect(emptyComment.assigned).toEqual([{assignees: ['newcomer'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
        expect(emptyComment.unassigned).toEqual([{assignees: ['StaleDev'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
        expect(emptyComment.created).toHaveLength(1);
        expect(emptyComment.created[0].body).toContain('Assigned to you');

        // Hidden team member PR still ignored even with complete pagination
        const teamPr = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({number: 19143})]]),
            permission    : () => 'maintain',
            graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}})
        });

        await teamPr.execute('pull_request_target', {
            action      : 'opened',
            pull_request: {
                author_association: 'CONTRIBUTOR',
                body              : 'Resolves #19143',
                created_at        : '2026-11-16T02:00:00Z',
                number            : 21502,
                user              : {id: 9001, login: 'team-member', type: 'User'}
            }
        });
        expect(teamPr.assigned).toEqual([]);
        expect(teamPr.created).toEqual([]);

        // Valid empty release notice succeeds cleanly when complete state holds
        const prevReleaseSince = process.env.NEO_CLAIM_RELEASE_SINCE;
        process.env.NEO_CLAIM_RELEASE_SINCE = '2026-11-15T00:00:00Z';
        try {
            const
                displaced = issueComment('displaced-dev', '2026-11-16T02:02:00Z', '/claim', {id: 8002}),
                refusal   = issueComment('github-actions[bot]', '2026-11-16T02:02:05Z',
                    `This one is taken.\n\n${replyMarker('displaced-dev')}\n<!-- claim-refused:8002 -->`,
                    {type: 'Bot'}),
                releaseOk = createWorkflowHarness({
                    issues        : new Map([[19143, curatedIssue({number: 19143})]]),
                    issueComments : new Map([[19143, [displaced, refusal]]]),
                    graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {endCursor: null, hasNextPage: false}}}}})
                });

            await releaseOk.execute('pull_request_target', {
                action      : 'closed',
                pull_request: {
                    author_association: 'NONE',
                    body              : 'Resolves #19143',
                    closed_at         : '2026-11-16T02:10:00Z',
                    created_at        : '2026-11-16T02:00:00Z',
                    merged            : false,
                    number            : 21500,
                    user              : {id: 7001, login: 'outside-dev', type: 'User'}
                }
            });
            expect(releaseOk.created).toHaveLength(1);
            expect(releaseOk.created[0].body).toContain(releaseMarker({issue: 19143, login: 'displaced-dev', pr: 21500, repo: 'neomjs/neo', to: displaced.user.id}))
        } finally {
            if (prevReleaseSince === undefined) delete process.env.NEO_CLAIM_RELEASE_SINCE;
            else process.env.NEO_CLAIM_RELEASE_SINCE = prevReleaseSince
        }
    });

    test('AC-2: unmerged close finishes final reads and release decisions across all targets before posting any notice', async () => {
        const
            prevReleaseSince = process.env.NEO_CLAIM_RELEASE_SINCE,
            displacedA       = issueComment('displaced-a', '2026-11-16T02:02:00Z', '/claim', {id: 8101}),
            refusalA         = issueComment('github-actions[bot]', '2026-11-16T02:02:05Z',
                `This one is taken.\n\n${replyMarker('displaced-a')}\n<!-- claim-refused:8101 -->`,
                {type: 'Bot'}),
            displacedB       = issueComment('displaced-b', '2026-11-16T02:03:00Z', '/claim', {id: 8102}),
            refusalB         = issueComment('github-actions[bot]', '2026-11-16T02:03:05Z',
                `This one is taken.\n\n${replyMarker('displaced-b')}\n<!-- claim-refused:8102 -->`,
                {type: 'Bot'}),
            closedPr         = {
                author_association: 'NONE',
                body              : 'Resolves #19143\nResolves #20691',
                closed_at         : '2026-11-16T02:10:00Z',
                created_at        : '2026-11-16T02:00:00Z',
                merged            : false,
                number            : 21500,
                user              : {id: 7001, login: 'outside-dev', type: 'User'}
            };

        process.env.NEO_CLAIM_RELEASE_SINCE = '2026-11-15T00:00:00Z';
        try {
            // 1. Both initial reads succeed and the first final read succeeds, then the second final read throws -> ZERO writes
            let   calls20691      = 0;
            const secondFinalFail = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
                issueComments : new Map([[19143, [displacedA, refusalA]], [20691, [displacedB, refusalB]]]),
                graphqlHandler: ({number}) => {
                    if (number === 20691 && ++calls20691 > 1) throw new Error('final read failure for #20691');
                    return {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}
                }
            });

            await secondFinalFail.execute('pull_request_target', {action: 'closed', pull_request: closedPr});
            expect(secondFinalFail.created).toEqual([]);
            expect(secondFinalFail.warnings).toHaveLength(1);
            expect(secondFinalFail.warnings[0]).toMatch(/final read failure for #20691/);

            // 2. Successful initial + final reads on both targets post both notices cleanly
            const bothOk = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
                issueComments : new Map([[19143, [displacedA, refusalA]], [20691, [displacedB, refusalB]]]),
                graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}})
            });

            await bothOk.execute('pull_request_target', {action: 'closed', pull_request: closedPr});
            expect(bothOk.created.map(call => call.issue_number)).toEqual([19143, 20691]);
            expect(bothOk.warnings).toEqual([]);

            // 3. Fresh final read observes a new upstream open PR holding the first target -> suppresses it and posts the second only
            let   calls19143        = 0;
            const lateHolderOnFirst = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
                issueComments : new Map([[19143, [displacedA, refusalA]], [20691, [displacedB, refusalB]]]),
                graphqlHandler: ({number}) => {
                    if (number === 19143 && ++calls19143 > 1) {
                        return {
                            repository: {
                                issue: {
                                    closedByPullRequestsReferences: {
                                        nodes   : [{author: {login: 'new-holder'}, merged: false, number: 21510, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}],
                                        pageInfo: {hasNextPage: false}
                                    }
                                }
                            }
                        }
                    }
                    return {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}
                }
            });

            await lateHolderOnFirst.execute('pull_request_target', {action: 'closed', pull_request: closedPr});
            expect(lateHolderOnFirst.created.map(call => call.issue_number)).toEqual([20691]);

            // 4. Write failure on second notice after first landed -> rerun skips already-notified target and writes the second once
            let   failWriteB = true;
            const retryWrite = createWorkflowHarness({
                issues           : new Map([[19143, curatedIssue({number: 19143})], [20691, curatedIssue({number: 20691})]]),
                issueComments    : new Map([[19143, [displacedA, refusalA]], [20691, [displacedB, refusalB]]]),
                graphqlHandler   : () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}),
                createCommentHook: async ({issue_number}) => {
                    if (issue_number === 20691 && failWriteB) {
                        failWriteB = false;
                        throw new Error('transient comment write error')
                    }
                }
            });

            await retryWrite.execute('pull_request_target', {action: 'closed', pull_request: closedPr});
            expect(retryWrite.created.map(call => call.issue_number)).toEqual([19143]);
            expect(retryWrite.warnings).toHaveLength(1);
            expect(retryWrite.warnings[0]).toMatch(/transient comment write error/);

            await retryWrite.execute('pull_request_target', {action: 'closed', pull_request: closedPr});
            expect(retryWrite.created.map(call => call.issue_number)).toEqual([19143, 20691])
        } finally {
            if (prevReleaseSince === undefined) delete process.env.NEO_CLAIM_RELEASE_SINCE;
            else process.env.NEO_CLAIM_RELEASE_SINCE = prevReleaseSince
        }
    });

    test('AC-2/AC-3: populated linked-PR nodes require valid state and repository identity while foreign/empty/redacted controls allow claims', async () => {
        const
            claim = issueComment('newcomer', '2026-11-16T02:00:00Z', '/claim'),
            pr    = {
                author_association: 'NONE',
                body              : 'Resolves #19143',
                created_at        : '2026-11-16T02:00:00Z',
                number            : 21500,
                user              : {id: 7001, login: 'outside-dev', type: 'User'}
            },
            badNodes = [
                {author: {login: 'someone'}, number: 21600, state: 'OPEN'},
                {author: {login: 'someone'}, number: 21601, repository: null, state: 'OPEN'},
                {author: {login: 'someone'}, number: 21602, repository: {}, state: 'OPEN'},
                {author: {login: 'someone'}, number: 21603, repository: {nameWithOwner: 'bad-slug'}, state: 'OPEN'},
                {author: {login: 'someone'}, number: 21604, repository: {nameWithOwner: 'neomjs/neo'}, state: 'UNKNOWN'},
                {author: {login: 'someone'}, number: 21605, repository: {nameWithOwner: 'neomjs/neo'}, state: 'open'},
                {author: {login: 'someone'}, number: 21606, repository: {nameWithOwner: 'neomjs/neo'}, state: ''}
            ];

        for (const badNode of badNodes) {
            const commentRun = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})]]),
                issueComments : new Map([[19143, [claim]]]),
                graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [badNode], pageInfo: {hasNextPage: false}}}}})
            });

            await expect(commentRun.execute('issue_comment', {comment: claim, issue: {number: 19143}}))
                .rejects.toThrow(/malformed linked pull request node/);
            expect(commentRun.assigned).toEqual([]);
            expect(commentRun.created).toEqual([]);

            const prRun = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})]]),
                graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [{...badNode, merged: false}], pageInfo: {hasNextPage: false}}}}})
            });

            await expect(prRun.execute('pull_request_target', {action: 'opened', pull_request: pr}))
                .rejects.toThrow(/malformed linked pull request node/);
            expect(prRun.assigned).toEqual([]);
            expect(prRun.created).toEqual([])
        }

        // Inconsistent closed/merged flag rejected when includeClosedPrs is true
        const mismatchedMerged = createWorkflowHarness({
            issues        : new Map([[19143, curatedIssue({number: 19143})]]),
            graphqlHandler: () => ({
                repository: {
                    issue: {
                        closedByPullRequestsReferences: {
                            nodes   : [{author: {login: 'someone'}, merged: true, number: 21607, repository: {nameWithOwner: 'neomjs/neo'}, state: 'CLOSED'}],
                            pageInfo: {hasNextPage: false}
                        }
                    }
                }
            })
        });

        await expect(mismatchedMerged.execute('pull_request_target', {action: 'opened', pull_request: pr}))
            .rejects.toThrow(/malformed linked pull request node/);
        expect(mismatchedMerged.assigned).toEqual([]);

        // Controls: known foreign-repository PR, empty list, and explicit redacted null allow valid claims
        for (const nodes of [[{author: {login: 'fork-dev'}, number: 99, repository: {nameWithOwner: 'fork-dev/neo'}, state: 'OPEN'}], [], [null]]) {
            const ok = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue({number: 19143})]]),
                issueComments : new Map([[19143, [claim]]]),
                graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes, pageInfo: {hasNextPage: false}}}}})
            });

            await ok.execute('issue_comment', {comment: claim, issue: {number: 19143}});
            expect(ok.assigned).toEqual([{assignees: ['newcomer'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
            expect(ok.created[0].body).toContain('Assigned to you')
        }
    });
});

test.describe('claim-responder guidance for unrecognized comments', () => {
    const marker = '<!-- claim-guidance:v1 {"repo":"neomjs/neo","issue":19143,"to":7001} -->';

    test('guidance writes no ownership, deduplicates on numeric identity, and leaves a later /claim actionable', async () => {
        const
            unknown = issueComment('newcomer', new Date(Date.now() - 2000).toISOString(),
                'Hi! I can help after we agree on scope and budget. Work will not begin until we agree.',
                {id: 9101, userId: 7001}),
            comments = new Map([[19143, [unknown]]]),
            target = curatedIssue(),
            harness = createWorkflowHarness({
                issues        : new Map([[19143, target]]),
                issueComments : comments,
                graphqlHandler: () => ({repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}})
            });

        await harness.execute('issue_comment', {comment: unknown, issue: {number: 19143}});
        expect(harness.created).toHaveLength(1);
        expect(harness.created[0]).toMatchObject({issue_number: 19143, owner: 'neomjs', repo: 'neo'});
        expect(harness.created[0].body).toContain(marker);
        expect(harness.created[0].body).toContain('/claim');
        expect(harness.created[0].body).not.toContain(replyMarker('newcomer'));
        expect(harness.assigned).toEqual([]);
        expect(harness.unassigned).toEqual([]);
        expect(harness.updated).toEqual([]);
        expect(target.assignees).toEqual([]);

        await harness.execute('issue_comment', {comment: unknown, issue: {number: 19143}});
        expect(harness.created).toHaveLength(1);

        const renamed = issueComment('renamed-newcomer', new Date(Date.now() - 1000).toISOString(),
            'Could someone explain the expected input?', {id: 9102, userId: 7001});
        comments.set(19143, [...comments.get(19143), renamed]);
        await harness.execute('issue_comment', {comment: renamed, issue: {number: 19143}});
        expect(harness.created).toHaveLength(1);
        expect(harness.assigned).toEqual([]);

        const claim = issueComment('renamed-newcomer', new Date().toISOString(), '/claim', {id: 9103, userId: 7001});
        comments.set(19143, [...comments.get(19143), claim]);
        await harness.execute('issue_comment', {comment: claim, issue: {number: 19143}});
        expect(harness.created).toHaveLength(2);
        expect(harness.created[1].body).toContain(replyMarker('renamed-newcomer'));
        expect(harness.created[1].body).toContain('Assigned to you');
        expect(harness.assigned).toEqual([{assignees: ['renamed-newcomer'], issue_number: 19143, owner: 'neomjs', repo: 'neo'}]);
        expect(harness.unassigned).toEqual([]);
        expect(harness.updated).toEqual([])
    });

    test('the commenter\'s own upstream PR on a later linked-reference page suppresses guidance', async () => {
        const
            unknown = issueComment('newcomer', new Date().toISOString(), 'What input does this need?', {id: 9201, userId: 7001}),
            harness = createWorkflowHarness({
                issues        : new Map([[19143, curatedIssue()]]),
                issueComments : new Map([[19143, [unknown]]]),
                graphqlHandler: ({after}) => ({repository: {issue: {closedByPullRequestsReferences: after === null
                    ? {nodes: [forkRef(1)], pageInfo: {endCursor: 'next', hasNextPage: true}}
                    : {nodes: [{author: {login: 'newcomer'}, number: 21999, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}], pageInfo: {hasNextPage: false}}
                }}})
            });

        await harness.execute('issue_comment', {comment: unknown, issue: {number: 19143}});
        expect(harness.graphqlCalls.map(call => call.vars.after)).toEqual([null, 'next']);
        expect(harness.created).toEqual([]);
        expect(harness.assigned).toEqual([]);
        expect(harness.unassigned).toEqual([]);
        expect(harness.updated).toEqual([])
    });

    test('a second snapshot catches a new holder, closure or guidance before any hint is posted', async () => {
        for (const change of ['assignee', 'closed', 'claim', 'own-claim', 'hint', 'pull-request']) {
            const
                unknown  = issueComment('newcomer', new Date(Date.now() - 2000).toISOString(), 'What input does this need?', {id: 9301, userId: 7001}),
                issues   = new Map([[19143, curatedIssue()]]),
                comments = new Map([[19143, [unknown]]]),
                harness  = createWorkflowHarness({
                    issues,
                    issueComments : comments,
                    graphqlHandler: (vars, call) => {
                        // The first snapshot has already copied its issue/comments; later reads see these replacements.
                        if (call === 1) {
                            if (change === 'assignee') issues.set(19143, curatedIssue({assignees: [{id: 7002, login: 'new-holder'}]}));
                            if (change === 'closed') issues.set(19143, curatedIssue({state: 'closed'}));
                            if (change === 'claim' || change === 'own-claim') comments.set(19143, [unknown,
                                issueComment(change === 'claim' ? 'new-holder' : 'newcomer', new Date().toISOString(), '/claim',
                                    {id: 9302, userId: change === 'claim' ? 7002 : 7001})]);
                            if (change === 'hint') comments.set(19143, [unknown,
                                issueComment('github-actions[bot]', new Date().toISOString(), marker, {id: 9303, type: 'Bot'})]);
                        }
                        const nodes = change === 'pull-request' && call > 1
                            ? [{author: {login: 'new-holder'}, number: 21999, repository: {nameWithOwner: 'neomjs/neo'}, state: 'OPEN'}]
                            : [];
                        return {repository: {issue: {closedByPullRequestsReferences: {nodes, pageInfo: {hasNextPage: false}}}}}
                    }
                });

            await harness.execute('issue_comment', {comment: unknown, issue: {number: 19143}});
            expect(harness.graphqlCalls, change).toHaveLength(2);
            expect(harness.created, change).toEqual([]);
            expect(harness.assigned, change).toEqual([]);
            expect(harness.unassigned, change).toEqual([]);
            expect(harness.updated, change).toEqual([])
        }
    });

    test('incomplete initial or final holder snapshots cannot produce guidance or ownership writes', async () => {
        for (const failAt of [1, 2]) {
            const
                unknown = issueComment('newcomer', new Date().toISOString(), 'What input does this need?', {id: 9401, userId: 7001}),
                harness = createWorkflowHarness({
                    issues        : new Map([[19143, curatedIssue()]]),
                    issueComments : new Map([[19143, [unknown]]]),
                    graphqlHandler: (vars, call) => {
                        if (call === failAt) {
                            if (failAt === 2) throw new Error('final holder read unavailable');
                            return {repository: {issue: {closedByPullRequestsReferences: {nodes: []}}}}
                        }
                        return {repository: {issue: {closedByPullRequestsReferences: {nodes: [], pageInfo: {hasNextPage: false}}}}}
                    }
                });

            await expect(harness.execute('issue_comment', {comment: unknown, issue: {number: 19143}}))
                .rejects.toThrow(/Incomplete state read/);
            expect(harness.created).toEqual([]);
            expect(harness.assigned).toEqual([]);
            expect(harness.unassigned).toEqual([]);
            expect(harness.updated).toEqual([])
        }
    });
});
