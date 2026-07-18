import {
    FETCH_SHADOW_DISCUSSION_COMMENTS_PAGE,
    FETCH_SHADOW_DISCUSSION_REPLIES_PAGE,
    FETCH_SHADOW_DISCUSSION_ROOTS,
    FETCH_SHADOW_ISSUE_ROOTS,
    FETCH_SHADOW_PULL_REQUEST_REVIEWS_PAGE,
    FETCH_SHADOW_PULL_REQUEST_ROOTS
} from './queries/communityActivityShadowQueries.mjs';

/**
 * @module ai/services/github-workflow/communityActivityShadowReader
 * @summary Window-bounded, read-only GitHub acquisition for the community-activity shadow probe.
 *
 * The callable returned here selects and emits metadata only. It owns no production event,
 * checkpoint, Task, count, wake, persistence or policy authority. Source gaps stay explicit:
 * absence is never a deletion, current revisions are never called history, and the Discussion
 * child-watermark limitation remains a lower-bound receipt.
 */

const ALLOWED_FAMILIES = new Set(['issues', 'pullRequests', 'discussions']);

const STATIC_GAPS = {
    issues: [
        {code: 'issue_lifecycle_history_not_acquired', scope: 'issue_timeline'},
        {code: 'issue_comment_deletion_tombstones_unavailable', scope: 'repository_issue_comments'},
        {code: 'historical_revisions_unavailable', scope: 'issue_comments'},
        {code: 'absence_is_not_a_tombstone', scope: 'issues'}
    ],
    pullRequests: [
        {code: 'pull_request_lifecycle_history_not_acquired', scope: 'pull_request_timeline'},
        {code: 'pull_request_comment_deletion_tombstones_unavailable', scope: 'repository_issue_comments'},
        {code: 'review_comment_deletion_tombstones_unavailable', scope: 'repository_review_comments'},
        {code: 'historical_revisions_unavailable', scope: 'pull_request_comments_and_reviews'},
        {code: 'search_window_has_day_granularity', scope: 'pull_request_roots'},
        {code: 'absence_is_not_a_tombstone', scope: 'pull_requests'}
    ],
    discussions: [
        {code: 'discussion_child_watermark_lower_bound', scope: 'discussion_comments_and_replies'},
        {code: 'historical_revisions_unavailable', scope: 'discussion_comments_and_replies'},
        {code: 'historical_deletion_tombstones_unavailable', scope: 'discussion_comments_and_replies'},
        {code: 'absence_is_not_a_tombstone', scope: 'discussions'}
    ]
};

const actorFrom = value => ({
    login: value?.login ?? null,
    type : value?.__typename ?? value?.type ?? null
});

const sourceId = value => {
    const id = value?.node_id ?? value?.id;

    return id == null ? null : String(id)
};

const sourceDatabaseId = value => value?.databaseId ?? value?.fullDatabaseId ?? value?.id ?? null;

const occurrence = ({id, providerEntityId, eventType, actor, responseBearing, mutationKind, activityAt,
    timestamps, values = {}}) => ({
    id,
    providerEntityId,
    eventType,
    actor,
    responseBearing,
    mutationKind,
    activityAt,
    timestamps,
    ...values
});

const rootValues = node => ({
    databaseId       : sourceDatabaseId(node),
    number           : node.number,
    sourceAssociation: node.authorAssociation ?? null,
    state            : node.state ?? (node.closed === true ? 'CLOSED' : 'OPEN'),
    stateReason      : node.stateReason ?? null,
    isDraft          : node.isDraft ?? null,
    isAnswered       : node.isAnswered ?? null,
    locked           : node.locked ?? null
});

/** @summary Emits independent root occurrences so one preferred timestamp cannot erase another. */
const mapRootOccurrences = (family, node) => {
    const providerEntityId = sourceId(node);
    const rootName         = family === 'issues' ? 'Issue' : family === 'pullRequests' ? 'PullRequest' : 'Discussion';
    const values           = rootValues(node);
    const rows             = [];

    if (node.createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:created`,
            providerEntityId,
            eventType      : `${rootName}Created`,
            actor          : actorFrom(node.author),
            responseBearing: true,
            mutationKind   : 'create',
            activityAt     : node.createdAt,
            timestamps     : {createdAt: node.createdAt},
            values
        }))
    }
    if (node.lastEditedAt && node.lastEditedAt !== node.createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:edited:${node.lastEditedAt}`,
            providerEntityId,
            eventType      : `${rootName}ContentRevision`,
            actor          : actorFrom(node.author),
            responseBearing: false,
            mutationKind   : 'revision',
            activityAt     : node.lastEditedAt,
            timestamps     : {lastEditedAt: node.lastEditedAt},
            values
        }))
    }
    if (node.updatedAt && node.updatedAt !== node.createdAt && node.updatedAt !== node.lastEditedAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:updated:${node.updatedAt}`,
            providerEntityId,
            eventType      : `${rootName}SnapshotUpdate`,
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'update',
            activityAt     : node.updatedAt,
            timestamps     : {updatedAt: node.updatedAt},
            values
        }))
    }

    const stateAt = node.mergedAt || node.closedAt;

    if (stateAt) {
        const stateName = node.mergedAt ? 'Merged' : 'Closed';

        rows.push(occurrence({
            id             : `${providerEntityId}:${stateName.toLowerCase()}:${stateAt}`,
            providerEntityId,
            eventType      : `${rootName}${stateName}`,
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'state_transition',
            activityAt     : stateAt,
            timestamps     : node.mergedAt ? {mergedAt: stateAt} : {closedAt: stateAt},
            values
        }))
    }

    return rows
};

/** @summary Emits independent creation/revision occurrences for one REST comment snapshot. */
const mapRestCommentOccurrences = ({node, family, parent}) => {
    const createdAt        = node.created_at ?? null;
    const updatedAt        = node.updated_at ?? null;
    const isReviewComment  = family === 'pullRequests' && Boolean(node.pull_request_url);
    const providerEntityId = sourceId(node);
    const eventType        = isReviewComment
        ? 'PullRequestReviewComment'
        : family === 'pullRequests'
            ? 'PullRequestIssueComment'
            : 'IssueComment';
    const values = {
        databaseId       : node.id ?? null,
        parentId         : sourceId(parent),
        number           : parent.number,
        sourceAssociation: node.author_association ?? null,
        reviewDatabaseId : node.pull_request_review_id ?? null,
        replyToDatabaseId: node.in_reply_to_id ?? null
    };
    const rows = [];

    if (createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:created`,
            providerEntityId,
            eventType,
            actor          : actorFrom(node.user),
            responseBearing: true,
            mutationKind   : 'create',
            activityAt     : createdAt,
            timestamps     : {createdAt},
            values
        }))
    }

    if (updatedAt && updatedAt !== createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:updated:${updatedAt}`,
            providerEntityId,
            eventType      : `${eventType}Revision`,
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'revision',
            activityAt     : updatedAt,
            timestamps     : {updatedAt},
            values
        }))
    }

    return rows
};

/** @summary Emits independent submission/revision occurrences for one review snapshot. */
const mapReviewOccurrences = (node, pullRequest) => {
    const createdAt        = node.createdAt ?? null;
    const submittedAt      = node.submittedAt || createdAt;
    const updatedAt        = node.lastEditedAt || node.updatedAt || null;
    const providerEntityId = sourceId(node);
    const values           = {
        databaseId       : sourceDatabaseId(node),
        parentId         : sourceId(pullRequest),
        number           : pullRequest.number,
        state            : node.state ?? null,
        sourceAssociation: node.authorAssociation ?? null
    };
    const rows = [];

    if (submittedAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:submitted`,
            providerEntityId,
            eventType      : 'PullRequestReview',
            actor          : actorFrom(node.author),
            responseBearing: true,
            mutationKind   : 'create',
            activityAt     : submittedAt,
            timestamps     : {createdAt, submittedAt},
            values
        }))
    }

    if (updatedAt && updatedAt !== submittedAt && updatedAt !== createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:updated:${updatedAt}`,
            providerEntityId,
            eventType      : 'PullRequestReviewRevision',
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'revision',
            activityAt     : updatedAt,
            timestamps     : {updatedAt, lastEditedAt: node.lastEditedAt ?? null},
            values
        }))
    }

    return rows
};

/** @summary Emits independent create/revision/tombstone occurrences for a Discussion comment. */
const mapDiscussionCommentOccurrences = (node, discussion, parentId = null) => {
    const createdAt        = node.createdAt ?? null;
    const updatedAt        = node.lastEditedAt || node.updatedAt || null;
    const providerEntityId = sourceId(node);
    const eventType        = parentId ? 'DiscussionReply' : 'DiscussionComment';
    const values           = {
        databaseId       : sourceDatabaseId(node),
        parentId         : parentId || sourceId(discussion),
        discussionId     : sourceId(discussion),
        number           : discussion.number,
        isAnswer         : node.isAnswer ?? null,
        sourceAssociation: node.authorAssociation ?? null
    };
    const rows = [];

    if (createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:created`,
            providerEntityId,
            eventType,
            actor          : actorFrom(node.author),
            responseBearing: true,
            mutationKind   : 'create',
            activityAt     : createdAt,
            timestamps     : {createdAt},
            values
        }))
    }

    if (updatedAt && updatedAt !== createdAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:updated:${updatedAt}`,
            providerEntityId,
            eventType      : `${eventType}Revision`,
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'revision',
            activityAt     : updatedAt,
            timestamps     : {updatedAt, lastEditedAt: node.lastEditedAt ?? null},
            values
        }))
    }

    if (node.deletedAt) {
        rows.push(occurrence({
            id             : `${providerEntityId}:deleted:${node.deletedAt}`,
            providerEntityId,
            eventType      : `${eventType}Deleted`,
            actor          : {login: null, type: null},
            responseBearing: false,
            mutationKind   : 'delete',
            activityAt     : node.deletedAt,
            timestamps     : {deletedAt: node.deletedAt},
            values         : {...values, tombstone: true}
        }))
    }

    return rows
};

const gap = (code, scope, error = null, values = {}) => ({
    code,
    scope,
    status   : error?.status ?? error?.statusCode ?? null,
    errorCode: error?.code == null ? null : String(error.code),
    ...values
});

const parentNumberFrom = (node, kind) => {
    const url   = kind === 'review' ? node.pull_request_url : node.issue_url;
    const match = url?.match(kind === 'review' ? /\/pulls\/(\d+)$/ : /\/issues\/(\d+)$/);

    return match ? Number(match[1]) : null
};

/**
 * @summary Binds GET-only REST, GraphQL and a millisecond clock into one shadow snapshot callable.
 * @param {Object} params
 * @param {Function} params.query Injected `GraphqlService.query` compatible transport.
 * @param {Function} params.rest Injected `GraphqlService.rest` compatible transport.
 * @param {Function} params.now Millisecond clock for acquisition and latency receipts.
 * @param {Object} [params.config] Reserved wiring config; no policy defaults are read from it.
 * @returns {Function} `async reader({provider, owner, repo, window, pageSize, families, runIndex})`.
 */
export function makeCommunityActivityShadowReader({query, rest, now, config = {}} = {}) {
    if (typeof query !== 'function') throw new Error('makeCommunityActivityShadowReader: `query` is required');
    if (typeof rest !== 'function') throw new Error('makeCommunityActivityShadowReader: `rest` is required');
    if (typeof now !== 'function') throw new Error('makeCommunityActivityShadowReader: `now` is required');
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('makeCommunityActivityShadowReader: `config` must be an object')
    }

    const clock = () => {
        const value = Number(now());

        if (!Number.isFinite(value)) throw new Error('communityActivityShadowReader: `now()` must return milliseconds');

        return value
    };

    return async function readCommunityActivityShadowSnapshot({provider, owner, repo, window, pageSize, families,
        runIndex} = {}) {
        if (provider !== 'github') throw new Error('communityActivityShadowReader: provider must be github');
        if (!owner || !repo) throw new Error('communityActivityShadowReader: owner and repo are required');
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
            throw new Error('communityActivityShadowReader: pageSize must be an integer from 1 through 100')
        }
        if (!Array.isArray(families) || families.length === 0
            || families.some(family => !ALLOWED_FAMILIES.has(family))) {
            throw new Error('communityActivityShadowReader: families contains an unsupported source family')
        }

        const windowStart = Date.parse(window?.start || '');
        const windowEnd   = Date.parse(window?.end || '');

        if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowStart >= windowEnd) {
            throw new Error('communityActivityShadowReader: window.start must precede window.end')
        }

        const startedMs = clock();
        const transport = {graphqlCalls: [], restCalls: [], graphqlCost: 0};
        const results   = Object.fromEntries([...new Set(families)].map(family => [family, {
            pages    : [],
            gaps     : STATIC_GAPS[family].map(item => ({...item})),
            exhausted: true
        }]));
        const inWindow = row => {
            const timestamp = Date.parse(row.activityAt || '');

            return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp < windowEnd
        };
        const addGap = (family, item) => {
            results[family].gaps.push(item);
            results[family].exhausted = false
        };

        const graphql = async ({family, queryName, document, variables}) => {
            const started = clock();

            try {
                const raw       = await query(document, variables, {strict: false});
                const completed = clock();
                const envelope  = raw && typeof raw === 'object'
                    && (Object.hasOwn(raw, 'data') || Object.hasOwn(raw, 'errors'));
                const data      = envelope ? raw.data : raw;
                const errors    = envelope && Array.isArray(raw.errors) ? raw.errors : [];
                const rateLimit = data?.rateLimit ?? null;
                const receipt   = {
                    family,
                    queryName,
                    latencyMs : Math.max(0, completed - started),
                    cost      : Number.isFinite(rateLimit?.cost) ? rateLimit.cost : null,
                    remaining : Number.isFinite(rateLimit?.remaining) ? rateLimit.remaining : null,
                    resetAt   : rateLimit?.resetAt ?? null,
                    errorCount: errors.length
                };

                transport.graphqlCalls.push(receipt);
                if (Number.isFinite(receipt.cost)) transport.graphqlCost += receipt.cost;
                if (errors.length > 0) addGap(family, gap('graphql_partial_errors', queryName, null, {
                    count: errors.length
                }));

                return {data, latencyMs: receipt.latencyMs, rateCost: receipt.cost}
            } catch (error) {
                const completed = clock();

                transport.graphqlCalls.push({
                    family,
                    queryName,
                    latencyMs : Math.max(0, completed - started),
                    cost      : null,
                    remaining : null,
                    resetAt   : null,
                    errorCount: 1
                });
                throw error
            }
        };

        const restGet = async ({family, path}) => {
            const started = clock();

            try {
                const data      = await rest('GET', path);
                const completed = clock();
                const latencyMs = Math.max(0, completed - started);

                transport.restCalls.push({family, method: 'GET', latencyMs, rateCost: null});

                return {data, latencyMs}
            } catch (error) {
                const completed = clock();

                transport.restCalls.push({
                    family,
                    method   : 'GET',
                    latencyMs: Math.max(0, completed - started),
                    rateCost : null,
                    failed   : true
                });
                throw error
            }
        };

        const walkGraphql = async ({family, connectionName, id = null, number = null, document, queryName,
            variablesFor, selectConnection, mapRows, windowTerminal = null}) => {
            const sourceNodes = [];
            const seenCursors = new Set();
            let   cursor      = null;

            while (true) {
                let response;

                try {
                    response = await graphql({family, queryName, document, variables: variablesFor(cursor)})
                } catch (error) {
                    addGap(family, gap('graphql_request_failed', queryName, error, {id, number}));
                    return sourceNodes
                }

                const source = selectConnection(response.data);

                if (!source || !Array.isArray(source.nodes) || !source.pageInfo) {
                    addGap(family, gap('graphql_connection_missing', queryName, null, {id, number}));
                    return sourceNodes
                }

                const isWindowTerminal = typeof windowTerminal === 'function' && windowTerminal(source.nodes);
                const rows             = source.nodes.flatMap(node => mapRows(node)).filter(Boolean);

                sourceNodes.push(...source.nodes);
                results[family].pages.push({
                    id,
                    number,
                    connection           : connectionName,
                    cursor,
                    endCursor            : source.pageInfo.endCursor ?? null,
                    sourceHasNextPage    : source.pageInfo.hasNextPage === true,
                    windowTerminalReceipt: isWindowTerminal || undefined,
                    totalCount           : Number.isFinite(source.totalCount) ? source.totalCount : null,
                    sourceRows           : source.nodes.length,
                    latencyMs            : response.latencyMs,
                    rateCost             : response.rateCost,
                    rows                 : rows.filter(inWindow)
                });

                if (isWindowTerminal || source.pageInfo.hasNextPage !== true) return sourceNodes;

                const endCursor = source.pageInfo.endCursor;

                if (typeof endCursor !== 'string' || endCursor.length === 0) {
                    addGap(family, gap('graphql_missing_end_cursor', queryName, null, {id, number}));
                    return sourceNodes
                }
                if (seenCursors.has(endCursor)) {
                    addGap(family, gap('graphql_repeated_end_cursor', queryName, null, {id, number}));
                    return sourceNodes
                }

                seenCursors.add(endCursor);
                cursor = endCursor
            }
        };

        const readCollaborators = async () => {
            const collaborators = new Set();
            const pages         = [];
            const gaps          = [];
            const signatures    = new Set();
            let   page          = 1;

            while (true) {
                const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
                    + `/collaborators?affiliation=all&per_page=${pageSize}&page=${page}`;
                let response;

                try {
                    response = await restGet({family: 'collaborators', path})
                } catch (error) {
                    gaps.push(gap('collaborator_census_failed', 'collaborators', error, {page}));
                    return {
                        status       : collaborators.size > 0 ? 'partial' : 'unavailable',
                        collaborators: [...collaborators].sort(),
                        pages,
                        gaps
                    }
                }

                if (!Array.isArray(response.data)) {
                    gaps.push(gap('collaborator_census_malformed', 'collaborators', null, {page}));
                    return {
                        status       : collaborators.size > 0 ? 'partial' : 'unavailable',
                        collaborators: [...collaborators].sort(),
                        pages,
                        gaps
                    }
                }

                const terminalReceipt = response.data.length === 0;

                response.data.forEach(item => {
                    if (typeof item?.login === 'string' && item.login) collaborators.add(item.login)
                });
                pages.push({cursor: page, terminalReceipt, sourceRows: response.data.length,
                    latencyMs: response.latencyMs});

                if (terminalReceipt) {
                    return {status: 'complete', collaborators: [...collaborators].sort(), pages, gaps}
                }

                const signature = response.data.map(item => item?.login ?? item?.id ?? null).join('|');

                if (signatures.has(signature)) {
                    gaps.push(gap('collaborator_census_repeated_page', 'collaborators', null, {page}));
                    return {status: 'partial', collaborators: [...collaborators].sort(), pages, gaps}
                }

                signatures.add(signature);
                page++
            }
        };

        const walkRestCollection = async ({connectionName, pathForPage, targetFamilies, distribute}) => {
            const signatures       = new Set();
            const affectedFamilies = targetFamilies.filter(family => Object.hasOwn(results, family));
            let   page             = 1;

            while (true) {
                let response;

                try {
                    response = await restGet({family: connectionName, path: pathForPage(page)})
                } catch (error) {
                    affectedFamilies.forEach(family => addGap(family,
                        gap('rest_request_failed', connectionName, error, {page})));
                    return
                }

                if (!Array.isArray(response.data)) {
                    affectedFamilies.forEach(family => addGap(family,
                        gap('rest_collection_malformed', connectionName, null, {page})));
                    return
                }

                const terminalReceipt = response.data.length === 0;
                const distributed     = distribute(response.data, page);

                for (const family of Object.keys(results)) {
                    if (!Object.hasOwn(distributed, family)) continue;

                    results[family].pages.push({
                        id        : null,
                        number    : null,
                        connection: connectionName,
                        cursor    : page,
                        terminalReceipt,
                        sourceRows: response.data.length,
                        latencyMs : response.latencyMs,
                        rateCost  : null,
                        rows      : distributed[family].filter(inWindow)
                    })
                }

                if (terminalReceipt) return;

                const signature = response.data.map(item => item?.node_id ?? item?.id ?? null).join('|');

                if (signatures.has(signature)) {
                    Object.keys(distributed).forEach(family => addGap(family,
                        gap('rest_repeated_page', connectionName, null, {page})));
                    return
                }

                signatures.add(signature);
                page++
            }
        };

        const collaboratorCensus = await readCollaborators();
        const coordinates        = {owner, repo, limit: pageSize};
        let   issueRoots         = [];
        let   pullRequestRoots   = [];

        if (results.issues) {
            issueRoots = await walkGraphql({
                family          : 'issues',
                connectionName  : 'roots',
                document        : FETCH_SHADOW_ISSUE_ROOTS,
                queryName       : 'ShadowIssueRoots',
                variablesFor    : cursor => ({...coordinates, cursor, windowStart: window.start}),
                selectConnection: data => data?.repository?.issues,
                mapRows         : node => mapRootOccurrences('issues', node)
            })
        }

        if (results.pullRequests) {
            const startDay    = new Date(windowStart).toISOString().slice(0, 10);
            const searchQuery = `repo:${owner}/${repo} is:pr updated:>=${startDay}`;

            pullRequestRoots = await walkGraphql({
                family          : 'pullRequests',
                connectionName  : 'roots',
                document        : FETCH_SHADOW_PULL_REQUEST_ROOTS,
                queryName       : 'ShadowPullRequestRoots',
                variablesFor    : cursor => ({searchQuery, limit: pageSize, cursor}),
                selectConnection: data => data?.search,
                mapRows         : node => mapRootOccurrences('pullRequests', node)
            });

            const resultCount = results.pullRequests.pages.find(item => item.connection === 'roots')?.totalCount;

            if (Number.isFinite(resultCount) && resultCount >= 1000) {
                addGap('pullRequests', gap('github_search_1000_result_cap', 'pull_request_roots', null, {
                    resultCount
                }))
            }
        }

        const issueByNumber       = new Map(issueRoots.map(item => [item.number, item]));
        const pullRequestByNumber = new Map(pullRequestRoots.map(item => [item.number, item]));
        const since               = encodeURIComponent(new Date(windowStart).toISOString());
        const repoPath            = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

        if (results.issues || results.pullRequests) {
            await walkRestCollection({
                connectionName: 'repositoryIssueComments',
                targetFamilies: ['issues', 'pullRequests'],
                pathForPage   : page => `${repoPath}/issues/comments?since=${since}&sort=updated&direction=asc`
                    + `&per_page=${pageSize}&page=${page}`,
                distribute    : (nodes, page) => {
                    const rows    = {issues: [], pullRequests: []};
                    const missing = {issues: 0, pullRequests: 0};

                    for (const node of nodes) {
                        const number        = parentNumberFrom(node, 'issue');
                        const isPullRequest = /\/pull\//.test(node.html_url || '');
                        const family        = isPullRequest ? 'pullRequests' : 'issues';
                        const boundedParent = family === 'pullRequests'
                            ? pullRequestByNumber.get(number)
                            : issueByNumber.get(number);
                        const parent = boundedParent || (number == null ? null : {
                            id: family === 'pullRequests' ? (node.pull_request_url ?? node.issue_url) : node.issue_url,
                            number
                        });

                        if (parent) rows[family].push(...mapRestCommentOccurrences({node, family, parent}));
                        else missing[family]++
                    }

                    for (const family of Object.keys(missing)) {
                        if (missing[family] > 0 && results[family]) {
                            addGap(family, gap('comment_parent_outside_bounded_roots',
                                'repository_issue_comments', null, {page, count: missing[family]}))
                        }
                    }

                    return Object.fromEntries(Object.entries(rows).filter(([family]) => results[family]))
                }
            })
        }

        if (results.pullRequests) {
            await walkRestCollection({
                connectionName: 'repositoryReviewComments',
                targetFamilies: ['pullRequests'],
                pathForPage   : page => `${repoPath}/pulls/comments?since=${since}&sort=updated&direction=asc`
                    + `&per_page=${pageSize}&page=${page}`,
                distribute    : (nodes, page) => {
                    const rows    = [];
                    let   missing = 0;

                    for (const node of nodes) {
                        const number = parentNumberFrom(node, 'review');
                        const parent = pullRequestByNumber.get(number) || (number == null ? null : {
                            id: node.pull_request_url,
                            number
                        });

                        if (parent) rows.push(...mapRestCommentOccurrences({
                            node,
                            family: 'pullRequests',
                            parent
                        }));
                        else missing++
                    }
                    if (missing > 0) addGap('pullRequests', gap('review_comment_parent_outside_bounded_roots',
                        'repository_review_comments', null, {page, count: missing}));

                    return {pullRequests: rows}
                }
            });

            for (const pullRequest of pullRequestRoots.filter(item => {
                const updatedAt = Date.parse(item.updatedAt || item.createdAt || '');

                return Number.isFinite(updatedAt) && updatedAt >= windowStart
            })) {
                await walkGraphql({
                    family          : 'pullRequests',
                    connectionName  : 'reviews',
                    id              : sourceId(pullRequest),
                    number          : pullRequest.number,
                    document        : FETCH_SHADOW_PULL_REQUEST_REVIEWS_PAGE,
                    queryName       : 'ShadowPullRequestReviewsPage',
                    variablesFor    : cursor => ({...coordinates, number: pullRequest.number, cursor}),
                    selectConnection: data => data?.repository?.pullRequest?.reviews,
                    mapRows         : node => mapReviewOccurrences(node, pullRequest)
                })
            }
        }

        if (results.discussions) {
            const discussions = await walkGraphql({
                family          : 'discussions',
                connectionName  : 'roots',
                document        : FETCH_SHADOW_DISCUSSION_ROOTS,
                queryName       : 'ShadowDiscussionRoots',
                variablesFor    : cursor => ({...coordinates, cursor}),
                selectConnection: data => data?.repository?.discussions,
                mapRows         : node => mapRootOccurrences('discussions', node),
                windowTerminal  : nodes => nodes.length > 0
                    && nodes.every(node => Date.parse(node.updatedAt || '') < windowStart)
            });

            for (const discussion of discussions.filter(item => {
                const updatedAt = Date.parse(item.updatedAt || item.createdAt || '');

                return Number.isFinite(updatedAt) && updatedAt >= windowStart
            })) {
                const comments = await walkGraphql({
                    family          : 'discussions',
                    connectionName  : 'comments',
                    id              : sourceId(discussion),
                    number          : discussion.number,
                    document        : FETCH_SHADOW_DISCUSSION_COMMENTS_PAGE,
                    queryName       : 'ShadowDiscussionCommentsPage',
                    variablesFor    : cursor => ({...coordinates, number: discussion.number, cursor}),
                    selectConnection: data => data?.repository?.discussion?.comments,
                    mapRows         : node => mapDiscussionCommentOccurrences(node, discussion)
                });

                for (const comment of comments) {
                    if (!sourceId(comment)) {
                        addGap('discussions', gap('discussion_comment_id_missing', 'replies', null, {
                            number: discussion.number
                        }));
                        continue
                    }

                    await walkGraphql({
                        family          : 'discussions',
                        connectionName  : 'replies',
                        id              : sourceId(comment),
                        number          : discussion.number,
                        document        : FETCH_SHADOW_DISCUSSION_REPLIES_PAGE,
                        queryName       : 'ShadowDiscussionRepliesPage',
                        variablesFor    : cursor => ({commentId: sourceId(comment), limit: pageSize, cursor}),
                        selectConnection: data => data?.node?.replies,
                        mapRows         : node => mapDiscussionCommentOccurrences(node, discussion, sourceId(comment))
                    })
                }
            }
        }

        const completedMs = clock();

        return {
            schemaVersion: 'github-community-shadow-source.v1',
            notAuthority : true,
            provider,
            owner,
            repo,
            runIndex,
            window       : {start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString()},
            startedAt    : new Date(startedMs).toISOString(),
            completedAt  : new Date(completedMs).toISOString(),
            collaboratorCensus,
            families     : results,
            popularity   : {
                status: 'excluded',
                rows  : [],
                gaps  : [{code: 'popularity_telemetry_out_of_scope'}]
            },
            transport
        }
    }
}
