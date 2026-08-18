import {exec, execFile}     from 'child_process';
import {createHash}         from 'crypto';
import {readFileSync}       from 'fs';
import path                 from 'path';
import {promisify}          from 'util';
import Base                 from '../../../src/core/Base.mjs';
import GraphqlService       from './GraphqlService.mjs';
import aiConfig             from '../../mcp/server/github-workflow/config.mjs';
import logger               from '../../mcp/server/github-workflow/logger.mjs';
import RepositoryService    from './RepositoryService.mjs';
import {validateMergeReady} from '../../scripts/lifecycle/validateMergeReady.mjs';
import {
    groupReviewsByFamily,
    resolveReviewerFamily
}                           from '../graph/agentFamilyResolution.mjs';
import {
    ADD_PULL_REQUEST_REVIEW,
    buildIssueStatesQuery,
    GET_PULL_REQUEST_ID,
    GET_PULL_REQUEST_REVIEW,
    UPDATE_PULL_REQUEST_REVIEW
}                                              from './queries/mutations.mjs';
import {
    buildPullRequestsWithBeliefQuery,
    FETCH_PULL_REQUESTS,
    GET_CONVERSATION,
    GET_MERGE_READINESS
} from './queries/pullRequestQueries.mjs';
import {commentMatches, isSelectorPresent, malformedCommentIdError, omitScopedBody, parseCommentId}
                                              from './shared/commentSelector.mjs';
import {projectConversationTrust}              from './shared/conversationTrust.mjs';

const execAsync                           = promisify(exec);
const execFileAsync                       = promisify(execFile);
const PR_REVIEW_TEMPLATE_PATH             = '.agents/skills/pr-review/assets/pr-review-template.md';
const PR_REVIEW_FOLLOWUP_TEMPLATE_PATH    = '.agents/skills/pr-review/assets/pr-review-followup-template.md';
const PR_REVIEW_ROUND_2_TEMPLATE_PATH     = '.agents/skills/pr-review/assets/pr-review-round-2-template.md';
const PR_REVIEW_MICRO_DELTA_TEMPLATE_PATH = '.agents/skills/pr-review/assets/pr-review-micro-delta-template.md';
const ACKNOWLEDGED_RC_ADDRESSED_PREFIX    = 'addressed-by-';
const ACKNOWLEDGED_RC_EVIDENCE_PREFIX     = 'superior-evidence:';
const REVIEW_BUDGET_MANAGED_MARKER        = '[review-budget-managed]';
const REVIEW_BUDGET_OVERRIDE_MARKER       = '[review-budget-override]';
const REVIEW_BUDGET_BYPASS_PATTERN        = /^\[review-budget-bypass\]\s+reason:\s*\S.*$/im;
const REVIEW_BUDGET_AUDIT_FIELDS          = [
    'outcome',
    'ordinary-limit',
    'activation-issue',
    'activation-pr',
    'activated-at',
    'reason',
    'submitted-request-changes'
];
const DROP_SUPERSEDE_DISPOSITIONS = new Set([
    'implementation-off',
    'ticket-prescription-off',
    'ticket-premise-dead'
]);
const DROP_SUPERSEDE_CONTRACT_FIELDS = [
    'Source-coordinate falsifiers',
    'Salvage map',
    'Successor landing pad',
    'Successor map citation'
];

const MERGE_READINESS_PROJECTION      = 'merge-readiness';
const MERGE_READINESS_SCHEMA_VERSION  = 'neo.merge-readiness/v1';
const MERGE_READINESS_RULES_PAGE_SIZE = 100;
const MERGE_READINESS_RULES_MAX_PAGES = 10;
const MAX_BELIEVED_OPEN               = 100;

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        ).join(',')}}`;
    }

    return JSON.stringify(value);
}

function digestValue(value) {
    return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }

    Object.values(value).forEach(deepFreeze);

    return Object.freeze(value);
}

function createCodedError(code, message) {
    return Object.assign(new Error(message), {code});
}

function normalizeRequestedReviewer(node) {
    const reviewer = node?.requestedReviewer;

    if (reviewer?.__typename === 'User' && reviewer.login) {
        return {kind: 'user', login: reviewer.login};
    }

    if (reviewer?.__typename === 'Team' && reviewer.slug && reviewer.organization?.login) {
        return {kind: 'team', login: `${reviewer.organization.login}/${reviewer.slug}`};
    }

    return {kind: 'unknown', login: null};
}

/**
 * @summary Reads the reviewer state GitHub actually seated out of a `requested_reviewers` REST response.
 *
 * The `POST`/`DELETE` `requested_reviewers` endpoints answer with the full pull-request object, whose
 * `requested_reviewers` / `requested_teams` arrays are the post-mutation truth. That makes the response
 * itself the verification channel — no follow-up read is needed, and none should be added: a second call
 * would open a window in which a concurrent change could make the read disagree with what this call did.
 *
 * Logins are lower-cased because GitHub treats them case-insensitively (a caller passing `Neo-GPT` is
 * seated as `neo-gpt`); comparing raw would report a seated reviewer as missing.
 *
 * @param {string} stdout Raw `gh api` stdout for the mutation.
 * @returns {{users: Set<string>, teams: Set<string>}|null} Seated logins/slugs, or `null` when the payload
 * does not carry the expected shape — an unverifiable result the caller must surface as a failure rather
 * than degrade into an echo of its own request.
 */
function parseSeatedReviewerState(stdout) {
    let parsed;

    try {
        parsed = JSON.parse(stdout);
    } catch {
        return null;
    }

    const {requested_reviewers: users, requested_teams: teams} = parsed || {};

    // Both arrays must be present. A payload missing them proves nothing about who is seated, and
    // treating "absent" as "empty" would silently resurrect the false-success this guard exists to stop.
    if (!Array.isArray(users) || !Array.isArray(teams)) {
        return null;
    }

    return {
        users: new Set(users.map(user => user?.login?.toLowerCase()).filter(Boolean)),
        teams: new Set(teams.map(team => team?.slug?.toLowerCase()).filter(Boolean))
    };
}

/**
 * @summary Projects one PR board row with explicit nulls when GitHub does not prove a freshness field.
 * @param {Object} pullRequest GitHub pull-request node from the list query.
 * @returns {Object}
 */
function normalizePullRequestListItem(pullRequest) {
    const
        reviewConnection = pullRequest.reviewRequests,
        reviewers        = Array.isArray(reviewConnection?.nodes)
            ? reviewConnection.nodes.map(normalizeRequestedReviewer)
                .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))
            : null,
        reviewSourceReady = Array.isArray(reviewers) &&
            typeof reviewConnection?.pageInfo?.hasNextPage === 'boolean' &&
            !reviewConnection.pageInfo.hasNextPage &&
            reviewers.every(item => item.kind !== 'unknown');

    return {
        number          : pullRequest.number,
        title           : pullRequest.title,
        url             : pullRequest.url,
        createdAt       : pullRequest.createdAt,
        author          : pullRequest.author,
        state           : pullRequest.state,
        mergedAt        : pullRequest.mergedAt ?? null,
        reviewDecision  : pullRequest.reviewDecision ?? null,
        reviewRequests  : reviewSourceReady ? reviewers : null,
        baseRefName     : pullRequest.baseRefName ?? null,
        headRefOid      : pullRequest.headRefOid ?? null,
        mergeStateStatus: pullRequest.mergeStateStatus ?? null
    }
}

/**
 * @summary Validates the optional caller-owned believed-open PR coordinate before GitHub I/O.
 * @param {Number[]|undefined} believedOpen Candidate exact pull-request numbers.
 * @returns {String|null} A validation message, or null when the coordinate is valid or absent.
 */
function getBelievedOpenValidationMessage(believedOpen) {
    if (believedOpen === undefined) {
        return null;
    }

    if (!Array.isArray(believedOpen)) {
        return 'believedOpen must be an array when provided.'
    }

    if (believedOpen.length > MAX_BELIEVED_OPEN) {
        return `believedOpen accepts at most ${MAX_BELIEVED_OPEN} pull-request numbers.`
    }

    if (!believedOpen.every(number => Number.isInteger(number) && number > 0)) {
        return 'believedOpen entries must be positive integers.'
    }

    if (new Set(believedOpen).size !== believedOpen.length) {
        return 'believedOpen entries must be unique.'
    }

    return null;
}

/**
 * @summary Classifies every submitted PR coordinate from its direct aliased GitHub row.
 * @param {Object} repository Repository result containing the direct alias fields.
 * @param {Array<{alias: String, number: Number}>} lookups Ordered alias-to-number lookup plan.
 * @returns {{stillOpen: Number[], falsified: Object[], unverifiable: Object[]}}
 */
function projectBelievedOpen(repository, lookups) {
    const stillOpen    = [];
    const falsified    = [];
    const unverifiable = [];

    lookups.forEach(({alias, number}) => {
        const pullRequest = repository[alias];

        if (pullRequest?.state === 'OPEN') {
            stillOpen.push(number);
        } else if (['CLOSED', 'MERGED'].includes(pullRequest?.state)) {
            falsified.push({
                number,
                state   : pullRequest.state,
                mergedAt: pullRequest.mergedAt ?? null
            })
        } else {
            unverifiable.push({
                number,
                reason: 'not-found-or-inaccessible'
            })
        }
    });

    return {
        stillOpen,
        falsified,
        unverifiable
    }
}

function classifyEmittedContext(node) {
    if (node?.__typename === 'CheckRun' && node.name) {
        const workflowRun = node.checkSuite?.workflowRun;
        let state;

        if (node.status !== 'COMPLETED') {
            state = 'pending';
        } else if (node.conclusion === 'SUCCESS') {
            state = 'success';
        } else if (node.conclusion === 'SKIPPED') {
            state = 'skipped';
        } else if (node.conclusion === 'NEUTRAL' || node.conclusion == null) {
            state = 'not-applicable';
        } else {
            state = 'failing';
        }

        return {
            kind         : 'check-run',
            name         : node.name,
            integrationId: node.checkSuite?.app?.databaseId ?? null,
            integration  : node.checkSuite?.app?.slug ?? null,
            status       : node.status,
            conclusion   : node.conclusion,
            state,
            url          : node.detailsUrl ?? null,
            workflow     : workflowRun ? {
                id          : workflowRun.workflow?.databaseId ?? null,
                name        : workflowRun.workflow?.name ?? null,
                resourcePath: workflowRun.workflow?.resourcePath ?? null,
                runId       : workflowRun.databaseId ?? null,
                runNumber   : workflowRun.runNumber ?? null,
                runAttempt  : workflowRun.runAttempt ?? null
            } : null
        };
    }

    if (node?.__typename === 'StatusContext' && node.context) {
        const state = node.state === 'SUCCESS'
            ? 'success'
            : ['EXPECTED', 'PENDING'].includes(node.state)
                ? 'pending'
                : ['ERROR', 'FAILURE'].includes(node.state)
                    ? 'failing'
                    : 'not-applicable';

        return {
            kind         : 'status-context',
            name         : node.context,
            integrationId: null,
            integration  : null,
            status       : node.state,
            conclusion   : null,
            state,
            url          : node.targetUrl ?? null,
            workflow     : null
        };
    }

    return {
        kind         : 'unknown',
        name         : null,
        integrationId: null,
        integration  : null,
        status       : null,
        conclusion   : null,
        state        : 'not-applicable',
        url          : null,
        workflow     : null
    };
}

/**
 * @summary Keeps every job from the latest exact-head run of each GitHub Actions workflow.
 *
 * A commit rollup can retain check runs from multiple invocations of the same workflow. Comparing
 * those rows by check name is unsafe: unrelated workflows commonly expose the same generic job name
 * (for example `lint`). The workflow definition id is therefore the grouping authority; run number
 * and attempt form the newest-run coordinate, while run id distinguishes contradictory equal tuples.
 * Check runs without a workflow owner (external integrations and legacy status contexts) stay intact
 * and continue through the conservative required-context comparison. A GitHub Actions check without
 * complete workflow coordinates makes the whole selection unreadable: silently retaining or dropping
 * it could either manufacture a green result or erase a live failure.
 *
 * @param {Object[]} contexts Normalized exact-head rollup contexts.
 * @returns {{contexts: Object[], readable: Boolean}} Selected contexts and selection readability.
 */
function selectLatestWorkflowContexts(contexts) {
    const latestByWorkflow = new Map();
    let   readable         = true;

    const compareCoordinates = (left, right) => {
        for (const field of ['runNumber', 'runAttempt']) {
            const delta = left[field] - right[field];

            if (delta) {
                return delta;
            }
        }

        return 0;
    };

    for (const context of contexts) {
        const workflow = context.workflow;

        if (context.kind !== 'check-run' || context.integration !== 'github-actions') {
            continue;
        }

        if (
            !Number.isInteger(workflow?.id) ||
            !Number.isInteger(workflow.runId) ||
            !Number.isInteger(workflow.runNumber) ||
            !Number.isInteger(workflow.runAttempt)
        ) {
            readable = false;
            continue;
        }

        const current  = latestByWorkflow.get(workflow.id);
        const ordering = current ? compareCoordinates(current, workflow) : 1;

        if (current && ordering === 0 && current.runId !== workflow.runId) {
            readable = false;
        } else if (!current || ordering < 0) {
            latestByWorkflow.set(workflow.id, workflow);
        }
    }

    const selected = contexts.filter(context => {
        const workflow = context.workflow;

        if (context.kind !== 'check-run' || context.integration !== 'github-actions') {
            return true;
        }

        if (!Number.isInteger(workflow?.id)) {
            return true;
        }

        const latest = latestByWorkflow.get(workflow.id);

        return workflow.runId === latest.runId &&
            workflow.runNumber === latest.runNumber &&
            workflow.runAttempt === latest.runAttempt;
    });

    return {contexts: selected, readable};
}

function normalizeMergeReadinessSnapshot(pullRequest) {
    if (!pullRequest) {
        throw createCodedError('PR_NOT_FOUND', 'The pull request does not exist or is not visible.');
    }

    const reviewConnection = pullRequest.reviewRequests;
    const reviewers        = (reviewConnection?.nodes || []).map(normalizeRequestedReviewer)
        .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    // Only APPROVED reviews are carried, and the narrowing is deliberate rather than incidental.
    // This collection exists to answer "which commit earned the approval", and it also enters the
    // double-read drift comparison — so keeping COMMENTED/PENDING reviews would fail observations
    // with SOURCE_CHANGED_DURING_READ every time a peer left a comment mid-read, for a change that
    // moves no readiness. A CHANGES_REQUESTED landing mid-read still trips the comparison, through
    // `reviewDecision`, which is where that state actually lives.
    const reviewsConnection = pullRequest.reviews;
    const approvals         = (reviewsConnection?.nodes || [])
        .filter(node => node?.state === 'APPROVED' && node?.commit?.oid && node?.submittedAt)
        .map(node => ({oid: node.commit.oid, submittedAt: node.submittedAt}))
        // Sorted rather than trusting connection order: the caller reads `.at(-1)` as "latest", and
        // an ordering assumption that holds today would fail silently — as a WRONG anchor, not a
        // missing one. `oid` breaks ties so two approvals sharing a timestamp stay deterministic
        // across the two reads, which the drift comparison requires.
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.oid.localeCompare(b.oid));
    const commit            = pullRequest.commits?.nodes?.[0]?.commit || null;
    const rollup            = commit?.statusCheckRollup;
    const contextConnection = rollup?.contexts;
    const rawContexts       = Array.isArray(contextConnection?.nodes) ? contextConnection.nodes : [];
    const selection         = selectLatestWorkflowContexts(rawContexts.map(classifyEmittedContext));
    const emittedContexts   = selection.contexts
        .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

    return {
        number          : pullRequest.number,
        state           : pullRequest.state,
        mergedAt        : pullRequest.mergedAt,
        baseRefName     : pullRequest.baseRefName,
        headRefOid      : pullRequest.headRefOid,
        mergeStateStatus: pullRequest.mergeStateStatus,
        reviewDecision  : pullRequest.reviewDecision,
        reviewRequests  : {
            available  : Boolean(reviewConnection && Array.isArray(reviewConnection.nodes)),
            hasNextPage: Boolean(reviewConnection?.pageInfo?.hasNextPage),
            nodes      : reviewers
        },
        approvals       : {
            available      : Boolean(reviewsConnection && Array.isArray(reviewsConnection.nodes)),
            hasPreviousPage: Boolean(reviewsConnection?.pageInfo?.hasPreviousPage),
            nodes          : approvals
        },
        checks: {
            commitAvailable  : Boolean(commit),
            commitOid        : commit?.oid ?? null,
            rollupAvailable  : Boolean(contextConnection && Array.isArray(contextConnection.nodes)),
            hasNextPage      : Boolean(contextConnection?.pageInfo?.hasNextPage),
            totalCount       : contextConnection?.totalCount ?? null,
            rawCount         : rawContexts.length,
            selectionReadable: selection.readable,
            nodes            : emittedContexts
        }
    };
}

function parseRequiredContexts(rules) {
    if (!Array.isArray(rules)) {
        throw createCodedError('REQUIRED_SET_UNREADABLE', 'Branch-rules response is not an array.');
    }

    const contexts = [];

    for (const rule of rules.filter(item => item?.type === 'required_status_checks')) {
        const required = rule?.parameters?.required_status_checks;

        if (!Array.isArray(required)) {
            throw createCodedError(
                'REQUIRED_SET_UNREADABLE',
                'A required_status_checks rule omitted its required_status_checks array.'
            );
        }

        for (const item of required) {
            const context       = typeof item?.context === 'string' ? item.context.trim() : '';
            const integrationId = item?.integration_id ?? null;

            if (!context || (integrationId !== null && !Number.isInteger(integrationId))) {
                throw createCodedError(
                    'REQUIRED_SET_UNREADABLE',
                    'A required status-check entry has a malformed context or integration_id.'
                );
            }

            contexts.push({context, integrationId});
        }
    }

    return [...new Map(contexts.map(item => [
        `${item.context}\u0000${item.integrationId ?? ''}`,
        item
    ])).values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

/**
 * @summary Reads the complete effective branch-rule population before reducing required contexts.
 *
 * GitHub paginates the branch-rules endpoint. A single readable JSON array is therefore not proof
 * that an empty required-context set is authoritative: a required-status-check rule may live on a
 * later page. Every page uses GitHub's maximum supported page size and only a terminal short page
 * proves completeness. The hard page ceiling fails closed instead of turning an unexpectedly large
 * or non-advancing source into a vacuous green result.
 *
 * @param {Function} rest      GitHub REST reader.
 * @param {String}   rulesPath Branch-rules endpoint without pagination parameters.
 * @returns {Promise<Object[]>} Complete branch-rule population.
 * @throws {Error} When a page is malformed or the bounded read cannot prove completeness.
 */
async function readCompleteBranchRules(rest, rulesPath) {
    const rules = [];

    for (let page = 1; page <= MERGE_READINESS_RULES_MAX_PAGES; page++) {
        const pageRules = await rest(
            'GET',
            `${rulesPath}?per_page=${MERGE_READINESS_RULES_PAGE_SIZE}&page=${page}`
        );

        if (!Array.isArray(pageRules)) {
            throw createCodedError('REQUIRED_SET_UNREADABLE', 'Branch-rules response is not an array.');
        }

        rules.push(...pageRules);

        if (pageRules.length < MERGE_READINESS_RULES_PAGE_SIZE) {
            return rules;
        }
    }

    throw createCodedError(
        'REQUIRED_SET_UNREADABLE',
        `Branch-rules response exceeded the bounded ${MERGE_READINESS_RULES_MAX_PAGES}-page read.`
    );
}

function compareRequiredAndEmittedContexts(requiredContexts, emittedContexts) {
    const requiredStates = requiredContexts.map(required => {
        const matches = emittedContexts.filter(emitted =>
            emitted.name === required.context &&
            (required.integrationId === null || emitted.integrationId === required.integrationId)
        );

        if (!matches.length) {
            return {...required, state: 'absent-required', emissions: []};
        }

        const priority = ['failing', 'pending', 'skipped', 'not-applicable', 'success'];
        const state    = priority.find(candidate => matches.some(item => item.state === candidate));

        return {...required, state, emissions: matches};
    });
    const emittedOnly = emittedContexts.filter(emitted =>
        !requiredContexts.some(required =>
            emitted.name === required.context &&
            (required.integrationId === null || emitted.integrationId === required.integrationId)
        )
    );

    return {requiredStates, emittedOnly};
}

function normalizeBoundPrincipals(identityAssertion) {
    const principals = identityAssertion?.principals || {};

    return {
        agentIdentity     : principals.agentIdentity || null,
        githubLogin       : principals.githubLogin || null,
        memoryCoreIdentity: principals.memoryCoreIdentity || null
    };
}

function createMergeReadinessFailure({
    owner,
    repo,
    prNumber,
    observedAt,
    principals,
    code,
    message,
    audit = [],
    source = {}
}) {
    return deepFreeze({
        schemaVersion: MERGE_READINESS_SCHEMA_VERSION,
        projection   : MERGE_READINESS_PROJECTION,
        repo         : `${owner}/${repo}`,
        pr           : prNumber,
        observedAt,
        principals,
        verdict      : 'unavailable',
        source,
        blockers     : [{code, message}],
        audit
    });
}

async function buildMergeReadinessProjection({
    prNumber,
    identityAssertion,
    owner = aiConfig.owner,
    repo = aiConfig.repo,
    query = GraphqlService.query.bind(GraphqlService),
    rest = GraphqlService.rest.bind(GraphqlService),
    now = () => new Date()
}) {
    const observedValue = now();
    const observedAt    = (observedValue instanceof Date ? observedValue : new Date(observedValue)).toISOString();
    const principals    = normalizeBoundPrincipals(identityAssertion);
    const audit         = [];
    const fail          = options => createMergeReadinessFailure({
        owner,
        repo,
        prNumber,
        observedAt,
        principals,
        audit,
        ...options
    });

    if (!identityAssertion?.ok || !principals.agentIdentity || !principals.githubLogin) {
        return fail({
            code   : 'IDENTITY_BINDING_MISSING',
            message: 'The merge-readiness projection requires bound AgentIdentity and GitHub principals.',
            audit  : [{source: 'identity-assertion', outcome: 'failed'}]
        });
    }

    const identityBindingComplete = Boolean(principals.memoryCoreIdentity);

    const variables = {owner, repo, prNumber};
    let firstSnapshot;

    try {
        const data = await query(GET_MERGE_READINESS, variables);
        firstSnapshot = normalizeMergeReadinessSnapshot(data?.repository?.pullRequest);
        audit.push({source: 'github-graphql:pull-request-readiness', call: 1, outcome: 'read'});
    } catch (error) {
        return fail({
            code   : error.code || 'PR_SOURCE_UNREADABLE',
            message: error.message,
            audit  : [...audit, {source: 'github-graphql:pull-request-readiness', call: 1, outcome: 'failed'}]
        });
    }

    const rulesPath = `/repos/${owner}/${repo}/rules/branches/${encodeURIComponent(firstSnapshot.baseRefName)}`;
    let firstRequiredContexts;

    try {
        firstRequiredContexts = parseRequiredContexts(await readCompleteBranchRules(rest, rulesPath));
        audit.push({source: `github-rest:${rulesPath}`, call: 1, outcome: 'read'});
    } catch (error) {
        return fail({
            code   : 'REQUIRED_SET_UNREADABLE',
            message: error.message,
            audit  : [...audit, {source: `github-rest:${rulesPath}`, call: 1, outcome: 'failed'}],
            source : {base: firstSnapshot.baseRefName, head: firstSnapshot.headRefOid}
        });
    }

    let finalSnapshot;

    try {
        const data = await query(GET_MERGE_READINESS, variables);
        finalSnapshot = normalizeMergeReadinessSnapshot(data?.repository?.pullRequest);
        audit.push({source: 'github-graphql:pull-request-readiness', call: 2, outcome: 'read'});
    } catch (error) {
        return fail({
            code   : error.code || 'PR_SOURCE_UNREADABLE',
            message: error.message,
            audit  : [...audit, {source: 'github-graphql:pull-request-readiness', call: 2, outcome: 'failed'}],
            source : {base: firstSnapshot.baseRefName, head: firstSnapshot.headRefOid}
        });
    }

    let finalRequiredContexts;

    try {
        finalRequiredContexts = parseRequiredContexts(await readCompleteBranchRules(rest, rulesPath));
        audit.push({source: `github-rest:${rulesPath}`, call: 2, outcome: 'read'});
    } catch (error) {
        return fail({
            code   : 'REQUIRED_SET_UNREADABLE',
            message: error.message,
            audit  : [...audit, {source: `github-rest:${rulesPath}`, call: 2, outcome: 'failed'}],
            source : {base: finalSnapshot.baseRefName, head: finalSnapshot.headRefOid}
        });
    }

    if (
        stableStringify(firstSnapshot) !== stableStringify(finalSnapshot) ||
        stableStringify(firstRequiredContexts) !== stableStringify(finalRequiredContexts)
    ) {
        return fail({
            code   : 'SOURCE_CHANGED_DURING_READ',
            message: 'Pull-request readiness state or its effective required-context set changed during the observation.',
            source : {
                initial: {
                    base : firstSnapshot.baseRefName,
                    head : firstSnapshot.headRefOid,
                    state: firstSnapshot.state
                },
                final: {
                    base : finalSnapshot.baseRefName,
                    head : finalSnapshot.headRefOid,
                    state: finalSnapshot.state
                }
            }
        });
    }

    const snapshot          = finalSnapshot;
    const requiredContexts  = finalRequiredContexts;
    const comparison        = compareRequiredAndEmittedContexts(requiredContexts, snapshot.checks.nodes);
    const reviewSourceReady = snapshot.reviewRequests.available &&
        !snapshot.reviewRequests.hasNextPage &&
        snapshot.reviewRequests.nodes.every(item => item.kind !== 'unknown');
    const checkSourceReady = snapshot.checks.commitAvailable &&
        snapshot.checks.rollupAvailable &&
        !snapshot.checks.hasNextPage &&
        Number.isInteger(snapshot.checks.totalCount) &&
        snapshot.checks.totalCount === snapshot.checks.rawCount &&
        snapshot.checks.selectionReadable &&
        snapshot.checks.nodes.every(item => item.kind !== 'unknown') &&
        snapshot.checks.commitOid === snapshot.headRefOid;
    const checksGreen = checkSourceReady &&
        comparison.requiredStates.every(item => item.state === 'success');
    const selectedChecksGreen = checkSourceReady &&
        snapshot.checks.nodes.every(item => item.state === 'success');
    const checksVerdict = checkSourceReady
        ? selectedChecksGreen ? 'green' : 'not-green'
        : 'unknown';
    const reviewRequests = reviewSourceReady
        ? snapshot.reviewRequests.nodes.map(item => item.login)
        : undefined;
    const sourceBlockers = [];

    if (!reviewSourceReady) {
        sourceBlockers.push({
            code   : 'REVIEW_REQUESTS_UNREADABLE',
            message: 'The requested-reviewer connection is missing, truncated, or contains an unknown reviewer type.'
        });
    }

    if (!checkSourceReady) {
        sourceBlockers.push({
            code   : 'EMITTED_CONTEXTS_UNREADABLE',
            message: 'The head check-rollup is missing, truncated, malformed, or bound to a different commit.'
        });
    }

    comparison.requiredStates
        .filter(item => item.state !== 'success')
        .forEach(item => sourceBlockers.push({
            code   : item.state.toUpperCase().replaceAll('-', '_'),
            message: `Required context '${item.context}' is ${item.state}.`
        }));

    // The approval anchor is a REPORTING channel, not part of the predicate, so an unreadable
    // connection yields `undefined` — which the validator reads as "not reported", never as
    // "fresh". That inverts the fail-closed rule every other field here follows, and it has to:
    // the other fields certify readiness, so an un-queried one must block; this one certifies
    // nothing, and a caller that never asks for it is not making a weaker claim.
    const approvedAtOid = snapshot.approvals.available
        ? snapshot.approvals.nodes.at(-1)?.oid
        : undefined;
    const predicate = validateMergeReady({
        state           : snapshot.state,
        mergedAt        : snapshot.mergedAt,
        reviewDecision  : snapshot.reviewDecision,
        checksGreen,
        mergeStateStatus: snapshot.mergeStateStatus,
        reviewRequests,
        approvedAtOid,
        headRefOid      : snapshot.headRefOid
    });
    const sourceMergeReady    = predicate.strictMergeReady && sourceBlockers.length === 0;
    const certifiedMergeReady = sourceMergeReady && identityBindingComplete;
    const requiredSet         = {
        source  : `GET ${rulesPath}`,
        digest  : digestValue(requiredContexts),
        contexts: requiredContexts
    };
    const observationCore = {
        schemaVersion  : MERGE_READINESS_SCHEMA_VERSION,
        repo           : `${owner}/${repo}`,
        pr             : prNumber,
        base           : snapshot.baseRefName,
        head           : snapshot.headRefOid,
        state          : snapshot.state,
        mergedAt       : snapshot.mergedAt,
        observedAt,
        principals,
        identityBinding: {
            complete: identityBindingComplete,
            missing : identityBindingComplete ? [] : ['memoryCoreIdentity']
        },
        requiredSet,
        contextStates: comparison.requiredStates,
        predicate
    };
    const observationId = digestValue(observationCore);
    const result        = {
        ...observationCore,
        projection      : MERGE_READINESS_PROJECTION,
        observationId,
        mergeStateStatus: snapshot.mergeStateStatus,
        reviewDecision  : snapshot.reviewDecision,
        reviewRequests  : reviewRequests ?? null,
        emittedContexts : snapshot.checks.nodes,
        emittedOnly     : comparison.emittedOnly,
        checksGreen,
        checksVerdict,
        verdict         : identityBindingComplete
            ? sourceMergeReady ? 'merge-ready-observed' : 'not-merge-ready'
            : 'unavailable',
        statement       : !identityBindingComplete
            ? `Observed GitHub checks verdict '${checksVerdict}' at ${observedAt} for ${owner}/${repo}#${prNumber} head ${snapshot.headRefOid}; B-prime certification is unavailable because Memory Core identity is unbound.`
            : certifiedMergeReady
                // An advisory rides INSIDE the merge-ready sentence rather than after it. It fires
                // only when everything else is green — exactly when nothing draws the eye — and the
                // merge-ready statement travels beside `[merge-eligible]` to the human gate. A
                // sentence that says "strict merge-ready" and stops is, at a stale anchor, true and
                // misleading in the same breath.
                ? `Observed strict merge-ready at ${observedAt} for ${owner}/${repo}#${prNumber} head ${snapshot.headRefOid}.${predicate.advisories.length > 0 ? ` ${predicate.advisories.length} advisory/advisories require a reader judgement before merge — see 'advisories'.` : ''}`
                : `Did not observe strict merge-readiness at ${observedAt} for ${owner}/${repo}#${prNumber} head ${snapshot.headRefOid}.`,
        blockers: [
            ...(!identityBindingComplete ? [{
                code             : 'IDENTITY_BINDING_MISSING',
                message          : 'Memory Core identity is unbound; GitHub checks remain readable but B-prime certification is unavailable.',
                missingPrincipals: ['memoryCoreIdentity'],
                affects          : ['b-prime-certification']
            }] : []),
            ...sourceBlockers,
            ...predicate.blockers.map(message => ({code: 'STRICT_MERGE_READINESS', message}))
        ],
        // Lifted to top level and coded, in the same shape as `blockers`, and the symmetry is the
        // point rather than tidiness. A blocker is discoverable three other ways — it flips
        // `verdict`, rewrites `statement`, and suppresses `marker` — so burying it would still leave
        // three signals. An advisory has NO redundancy: it fires only on an otherwise-green
        // observation, so nested inside `predicate` it reaches no reader of the surface that
        // actually travels to the merge gate.
        advisories: predicate.advisories.map(message => ({code: 'APPROVAL_ANCHOR_STALE', message})),
        audit: [
            ...audit,
            {source: 'validateMergeReady', call: 1, outcome: sourceMergeReady ? 'positive' : 'negative'},
            {
                source : 'memory-core-identity',
                outcome: identityBindingComplete ? 'bound' : 'unbound-certification-withheld'
            }
        ],
        ...(certifiedMergeReady ? {marker: `[merge-eligible][B-prime:${observationId}]`} : {})
    };

    return deepFreeze(result);
}

const FULL_PR_REVIEW_TEMPLATE_SKELETON_LABELS = [
    'PR Review Summary',
    'Strategic-Fit Decision',
    'Patch-Blind Premise Snapshot',
    'Context & Graph Linking',
    'Depth Floor',
    'Graph Ingestion Notes',
    'Required Actions',
    'Evaluation Metrics'
];

// The EXCEPTIONAL-verdict template only: a validated Drop+Supersede or a guarded repair-minted
// re-entry. `Delta Depth Floor` and `Metrics Delta` are gone from it deliberately — an ordinary
// second round no longer reruns audits or re-scores metrics, so requiring those anchors here would
// force the exceptional template back into the ordinary role the terminal-round decision removed.
const FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_LABELS = [
    'PR Review Follow-Up',
    'Patch-Blind Premise Snapshot',
    'Strategic-Fit Decision',
    'Prior Review Anchor',
    'Delta Scope',
    'Previous Required Actions Audit',
    'Delta Depth Floor',
    'Premise Falsifiers',
    'Metrics Delta',
    'Required Actions'
];

// Ordinary Round 2. Four anchors, because the shape IS the constraint: a disposition over the
// Round-1 actions and nothing else. Adding a fifth here would re-admit the audit rerun this
// template exists to refuse.
const ROUND_2_PR_REVIEW_TEMPLATE_SKELETON_LABELS = [
    'PR Review — Round 2',
    'Anchor',
    'Disposition',
    'Verdict'
];

const FULL_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL = Object.freeze({
    'PR Review Summary'           : '# PR Review Summary',
    'Strategic-Fit Decision'      : '### 🪜 Strategic-Fit Decision',
    'Patch-Blind Premise Snapshot': '### 🧭 Patch-Blind Premise Snapshot',
    'Context & Graph Linking'     : '### 🕸️ Context & Graph Linking',
    'Depth Floor'                 : '### 🔬 Depth Floor',
    'Graph Ingestion Notes'       : '### 🧠 Graph Ingestion Notes',
    'Required Actions'            : '### 📋 Required Actions',
    'Evaluation Metrics'          : '### 📊 Evaluation Metrics'
});

const FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL = Object.freeze({
    'PR Review Follow-Up'            : '# PR Review Follow-Up',
    'Patch-Blind Premise Snapshot'   : '### 🧭 Patch-Blind Premise Snapshot',
    'Strategic-Fit Decision'         : '### 🪜 Strategic-Fit Decision',
    'Prior Review Anchor'            : '### ⚓ Prior Review Anchor',
    'Delta Scope'                    : '### 🔁 Delta Scope',
    'Previous Required Actions Audit': '### ✅ Previous Required Actions Audit',
    'Delta Depth Floor'              : '### 🔬 Delta Depth Floor',
    'Premise Falsifiers'             : '### 🔬 Premise Falsifiers',
    'Metrics Delta'                  : '### 📊 Metrics Delta',
    'Required Actions'               : '### 📋 Required Actions'
});

const ROUND_2_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL = Object.freeze({
    'PR Review — Round 2': '# PR Review — Round 2',
    'Anchor'             : '### ⚓ Anchor',
    'Disposition'        : '### 📋 Disposition',
    'Verdict'            : '### 🔚 Verdict'
});

const templateHeadingAnchorCache = new Map();

function getTemplateHeadingAnchors(templatePath, {projectRoot = aiConfig.projectRoot} = {}) {
    return readFileSync(path.resolve(projectRoot, templatePath), 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^#{1,6}\s+/.test(line));
}

function fallbackTemplateHeadingAnchorsByLabel(labels, fallbackByLabel) {
    return labels.map(label => {
        const anchor = fallbackByLabel[label];

        if (!anchor) {
            throw new Error(`Missing fallback heading for '${label}'`);
        }

        return anchor;
    });
}

function warnTemplateAnchorFallback(message, {log = logger} = {}) {
    const warn = log?.warn || log?.error || (() => {});

    warn.call(log, message);
}

function getTemplateHeadingAnchorsByLabel(templatePath, labels, {
    fallbackByLabel,
    log = logger,
    projectRoot = aiConfig.projectRoot
} = {}) {
    const cacheKey = `${projectRoot}\u0000${templatePath}\u0000${labels.join('\u0000')}`;

    if (templateHeadingAnchorCache.has(cacheKey)) {
        return templateHeadingAnchorCache.get(cacheKey);
    }

    let headings;

    try {
        headings = getTemplateHeadingAnchors(templatePath, {projectRoot});
    } catch (error) {
        const anchors = fallbackTemplateHeadingAnchorsByLabel(labels, fallbackByLabel);

        warnTemplateAnchorFallback(
            `[PullRequestService] Falling back to built-in pr-review template anchors because ${templatePath} could not be read from '${projectRoot}': ${error.message}`,
            {log}
        );
        templateHeadingAnchorCache.set(cacheKey, anchors);
        return anchors;
    }

    const anchors = labels.map(label => {
        const anchor = headings.find(line => line.includes(label));

        if (anchor) {
            return anchor;
        }

        const fallbackAnchor = fallbackByLabel[label];

        if (!fallbackAnchor) {
            throw new Error(`Missing '${label}' heading in ${templatePath}`);
        }

        warnTemplateAnchorFallback(
            `[PullRequestService] Falling back to built-in pr-review heading '${label}' because ${templatePath} no longer exposes it.`,
            {log}
        );
        return fallbackAnchor;
    });

    templateHeadingAnchorCache.set(cacheKey, anchors);
    return anchors;
}

/**
 * **Visible** template-anchor substrings — checked AND named in the error response on miss.
 *
 * These are the 7 evaluation-metric tags from `.agents/skills/pr-review/assets/pr-review-template.md`
 * (cycle-1) and `.agents/skills/pr-review/assets/pr-review-followup-template.md` (cycle-N). They are
 * also the regex parse keys that `ai/services/ingestion/ConceptDiscoveryService.mjs` consumes during
 * Retrospective-daemon REM-sleep graph ingestion — a malformed review with hallucinated metric
 * names produces zero graph ingest signal and is silently lost from the Native Edge Graph.
 *
 * Cycle-followup templates use the same 7 metric tags, so this set applies to both cycle-1
 * and cycle-N reviews without false-positive separation.
 *
 * Extension protocol: if the pr-review skill adds a new evaluation metric, append the literal
 * `[NEW_TAG]` string here AND update both template files in the same PR.
 */
const VISIBLE_PR_REVIEW_ANCHORS = [
    '[ARCH_ALIGNMENT]',
    '[CONTENT_COMPLETENESS]',
    '[EXECUTION_QUALITY]',
    '[PRODUCTIVITY]',
    '[IMPACT]',
    '[COMPLEXITY]',
    '[EFFORT_PROFILE]'
];

/**
 * **Invisible** template-anchor substrings — checked SILENTLY; NOT named in the error response
 * on miss. Defeats Goodhart anchor-stuffing while preserving useful diagnostics for visible misses.
 *
 * **Failure-mode the invisible layer prevents**:
 * A sophisticated agent receives the visible-list error, hallucinates a body that contains
 * exactly the named visible anchors but omits the actual template structure (e.g., bare
 * `### Strategic-Fit` heading without `Decision`, `### Metrics` without proper structure).
 * Visible-only validation passes the malformed body. The invisible layer catches this by
 * checking structural anchors that span both cycle-1 and cycle-followup templates.
 *
 * **Observed failure mode**: a malformed review can contain all visible metric tags while missing
 * `Depth Floor`, `Required Actions`, and `Strategic-Fit Decision` structure. These 3 substrings
 * empirically distinguish a structurally-correct review from a metric-tag-stuffed hallucination.
 *
 * **Why these specific substrings**:
 * - `Depth Floor` — cycle-1 has `🔬 Depth Floor`, cycle-followup has `Delta Depth Floor`. Both contain the substring.
 * - `Required Actions` — both cycle-1 (`📋 Required Actions`) and cycle-followup carry the literal heading.
 * - `Strategic-Fit Decision` — cycle-1 (`🪜 Strategic-Fit Decision`) and cycle-followup (`Strategic-Fit Decision`)
 *   both include the word `Decision`. Hallucinated headings that drop `Decision` fail this check.
 *
 * **Asymmetry that makes this work**:
 * - Author who reads `.agents/skills/pr-review/SKILL.md` and follows the template → all checks pass
 * - Author who hallucinates from the visible-list error → fails invisible check, retries
 * - Author who enumerates `## ` headings to anchor-stuff → fails because the invisible substrings
 *   require specific phrasing (e.g., `Decision` postfix on `Strategic-Fit`) that's hard to guess
 *   without reading the actual template
 *
 * **Discoverability vs. invisibility tension**: this list IS the substrate; future maintainers
 * editing this constant must understand the invisibility rationale. Hence this docstring. The
 * list is NOT documented in error responses, public README, or skill-file enumerations — only
 * here in the validator's source, where modification requires explicit awareness.
 *
 * **Maintenance protocol**: if the pr-review template adds or renames a structural section,
 * update this array to point at substrings that still distinguish valid from invalid bodies.
 * Tests in `PullRequestService.spec.mjs` assert behavior without naming invisible anchors in
 * prose; they import this constant by reference.
 */
const INVISIBLE_PR_REVIEW_ANCHORS = [
    'Depth Floor',
    'Required Actions',
    'Strategic-Fit Decision'
];

/**
 * REQUIRED premise-snapshot anchors — every agent PR review must carry all four. The fourth,
 * **Premise Coherence**, forces the value-coherence verdict ("does this PR's premise cohere with our
 * core values?") that fit-shape review skips — a green checklist over a wrong premise is theater.
 * The forcing-function raises the floor by forcing ARTICULATION, not depth: the field is satisfied
 * by a specific verdict ("coheres: lead stays facilitator-not-delegator" / "conflicts: adds
 * surveillance vs flat-peer-team") OR a scoped "N/A — no value-surface (scope: ...)" for a trivial
 * PR with no value-surface (the marginal-value skip). Match the distinctive bold template labels,
 * not bare prose, so incidental phrases do not satisfy the gate.
 */
const REQUIRED_PR_REVIEW_PREMISE_ANCHORS = [
    {label: 'Inputs Read Before Patch',  token: '**Inputs Read Before Patch:**'},
    {label: 'Expected Solution Shape',   token: '**Expected Solution Shape:**'},
    {label: 'Patch Verdict',             token: '**Patch Verdict:**'},
    {label: 'Premise Coherence',         token: '**Premise Coherence:**'}
];

const PR_REVIEW_ORIGIN_SESSION_PATTERN = /^\s*[*-]\s+\*\*Origin Session ID:\*\*\s+[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\s*$/im;

// Detects an ordinary Round 2. Kept to the H1 and its two structural sections: broadening this to
// shared vocabulary (`Anchor`, `Verdict`) would swallow bodies that belong to other shapes, and the
// misclassification is silent — a body validated against the wrong template reports missing anchors
// the author never owed.
const ROUND_2_DISPOSITIONS = Object.freeze(['ADDRESSED', 'DEFENDED', 'STILL_OPEN']);

/**
 * @summary The template path a body actually selected, for honest read-only reporting.
 *
 * Mirrors the dispatch order in `getPrReviewTemplateValidationFailure` rather than restating it as a
 * second set of conditions — the two must not be able to disagree, because the whole point is telling
 * an author which contract was applied to their body.
 * @param {String} body
 * @returns {String} Repo-relative asset path.
 */
function selectedPrReviewTemplatePath(body) {
    if (isRound2PrReview(body))     return PR_REVIEW_ROUND_2_TEMPLATE_PATH;
    if (isMicroDeltaPrReview(body)) return PR_REVIEW_MICRO_DELTA_TEMPLATE_PATH;

    if (FOLLOWUP_PR_REVIEW_SHAPE_HINTS.some(anchor => body.includes(anchor))) {
        return PR_REVIEW_FOLLOWUP_TEMPLATE_PATH
    }

    // Micro-review deliberately has no asset of its own — it is validated against a minimal floor and
    // authored from the canonical structure — so the canonical path is the honest answer here rather
    // than a file name that would 404 for whoever went looking.
    return PR_REVIEW_TEMPLATE_PATH
}

/**
 * @summary Validates an ordinary Round 2 against the round it claims to disposition.
 *
 * The body-only tier proves a document is disposition-SHAPED. It cannot prove a disposition occurred,
 * because that is a claim about two documents — and a shaped body with a plausible review id and an
 * invented `RA-999` passed the shape gate at review. This is the half that needs the prior round, so
 * it runs where the prior round is already in hand rather than duplicating a fetch.
 *
 * **Complete, ordered, unchanged.** Each is a distinct evasion. Dropping a row retires an action by
 * omission; reordering breaks the numbering the original review is cited by; rewording is how a
 * demand gets softened into one the author already met. Verbatim is the only comparison that refuses
 * all three, and it is why the template says quoted verbatim rather than summarised.
 *
 * **The state matrix is the other half of the contract.** `STILL_OPEN` means the Round-1 review stays
 * authoritative, which only holds if this round adds no new verdict — so it must be `COMMENT`. An
 * APPROVED round carrying a `STILL_OPEN` silently discharges the item it just declared unresolved,
 * and a REQUEST_CHANGES spends a round the per-family budget does not have.
 *
 * @param {Object}   options
 * @param {String}   options.body        The candidate Round-2 body.
 * @param {Object[]} options.reviews     Prior review nodes (`{body, state, submittedAt, author}`).
 * @param {String}   options.state       The GitHub review state being submitted.
 * @returns {Object|null} Failure payload, or `null` when the round is a faithful disposition.
 */
function getRound2DispositionRelationFailure({body, reviews, state}) {
    const prior = [...(reviews || [])]
        .filter(review => review?.state === 'CHANGES_REQUESTED')
        .sort((a, b) => Date.parse(b?.submittedAt || 0) - Date.parse(a?.submittedAt || 0))[0];

    if (!prior) {
        return round2RelationFailure([
            'This body declares itself a Round 2, but the pull request carries no submitted',
            '`CHANGES_REQUESTED` review for it to disposition. A first review uses the canonical template.'
        ])
    }

    const
        expected = extractRequiredActions(prior.body),
        rows     = extractDispositionRows(body),
        defects  = [];

    if (expected.length === 0) {
        return round2RelationFailure([
            `The prior \`CHANGES_REQUESTED\` review (${prior.url || prior.id}) lists no Required Actions,`,
            'so there is nothing for an ordinary Round 2 to disposition. Use the follow-up template.'
        ])
    }

    if (rows.length !== expected.length) {
        defects.push(`dispositions ${rows.length} action(s) against the prior round's ${expected.length} — every action gets a row, in order`)
    }

    expected.forEach((action, index) => {
        const row = rows[index];

        if (row && row.action !== action) {
            defects.push(`row ${index + 1} reads "${row.action}" where the prior round said "${action}" — carry it verbatim`)
        }
    });

    // A verdict is not a disposition. This catches the invented-action case even when the counts line
    // up, because an extra row has no prior action to match against.
    rows.slice(expected.length).forEach(row => {
        defects.push(`"${row.action}" appears in the table but not in the prior round — an ordinary Round 2 raises nothing new`)
    });

    const stillOpen = rows.some(row => row.disposition === 'STILL_OPEN');

    if (stillOpen && state !== 'COMMENT') {
        defects.push(`carries a STILL_OPEN item but submits as ${state} — a STILL_OPEN round keeps the ORIGINAL review authoritative and must be COMMENT, which is also why it spends no budget`)
    }

    if (!stillOpen && state === 'REQUEST_CHANGES') {
        defects.push('spends a REQUEST_CHANGES round while dispositioning every prior action — a fully discharged round is APPROVED or COMMENT')
    }

    return defects.length === 0 ? null : round2RelationFailure(defects.map(defect => `- This round ${defect}.`))
}

/**
 * @summary Renders a Round-2 relation failure.
 * @param {String[]} lines
 * @returns {Object}
 */
function round2RelationFailure(lines) {
    return {
        error  : 'PR Review Template Validation Failed',
        message: [
            'Round 2 is a disposition over the prior round, and this body does not match it.',
            '',
            '**Required action**: read `.agents/skills/pr-review/assets/pr-review-round-2-template.md`,',
            'then quote each prior Required Action verbatim, in order, with its disposition.',
            '',
            ...lines
        ].join('\n'),
        code: 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED'
    }
}

/**
 * @summary Extracts a review's Required Actions as ordered verbatim strings.
 *
 * The canonical and follow-up templates both carry actions as a `- [ ]` checklist under a Required
 * Actions heading, so the checklist IS the action packet. Everything after the heading up to the next
 * one is in scope, because an action's text can wrap.
 * @param {String} body A prior review body.
 * @returns {String[]} Action texts, in the order the round raised them.
 */
function extractRequiredActions(body) {
    const section = String(body || '').split(/^#{1,6}[ \t].*Required Actions.*$/im)[1];

    if (!section) return [];

    return section
        .split(/^#{1,6}[ \t]/m)[0]
        .split('\n')
        .filter(line => /^[ \t]*[-*][ \t]+\[[ x]\]/i.test(line))
        .map(line => line.replace(/^[ \t]*[-*][ \t]+\[[ x]\][ \t]*/i, '').trim())
        .filter(Boolean)
}

/**
 * @summary Extracts a Round-2 body's disposition table as `{action, disposition}` rows, in order.
 *
 * Reads the SECOND-to-last cell as the verb and everything before it as the carried action, so a
 * table with or without a trailing Evidence column parses the same way. Separator rows (`|---|`) and
 * the header are dropped by requiring a known verb.
 * @param {String} body
 * @returns {Array<{action: String, disposition: String}>}
 */
function extractDispositionRows(body) {
    return String(body || '').split('\n')
        .filter(line => line.trim().startsWith('|') && ROUND_2_DISPOSITIONS.some(verb => line.includes(verb)))
        .map(line => {
            const cells = line.split('|').slice(1, -1).map(cell => cell.trim()),
                  index = cells.findIndex(cell => ROUND_2_DISPOSITIONS.includes(cell));

            if (index === -1) return null;

            // The template's first column is `#`, carrying a label like `RA-1`. It is the row's
            // NUMBER, not part of the carried action, and folding it into the text made every row
            // compare as reworded against a prior round that never contained it — the verbatim check
            // failing on the one thing that is legitimately not verbatim.
            const carried  = cells.slice(0, index).filter(Boolean),
                  labelled = /^(?:RA[ _-]?)?#?\d+\.?$/i.test(carried[0] || '');

            return {
                action     : carried.slice(labelled ? 1 : 0).join(' ').trim(),
                disposition: cells[index]
            }
        })
        .filter(Boolean)
}

/**
 * @summary Whether a body DECLARES itself an ordinary Round 2 — its own H1, at line start.
 *
 * Selection is the first half of a format gate and it has to be exact. Matching any of the shape
 * hints meant a canonical review that merely contained `### 🔚 Verdict` was routed to the Round-2
 * tier and never premise-validated — a heading choice silently downgrading which rules apply, which
 * is a wider hole than the tier's own leniency because it opens the CANONICAL path. The H1 is the
 * format declaration; the section headings are its contents, and contents are shared vocabulary.
 * @param {String} body
 * @returns {Boolean}
 */
function isRound2PrReview(body) {
    return /^#[ \t]+PR Review — Round 2\b/m.test(body);
}

/**
 * @summary A disposition table row: a verdict verb in a pipe-delimited cell.
 *
 * The three verbs ARE the format's vocabulary, so matching them is what separates a dispositioned row
 * from a table that happens to exist. Anchored to a cell boundary rather than searched free-text: the
 * prose defining the verbs sits directly under the table in the template, and a substring test would
 * read that legend as evidence of a disposition — a document explaining the verbs would satisfy the
 * gate for using them.
 * @type {RegExp}
 */
const ROUND_2_DISPOSITION_ROW_PATTERN = /\|[^|\n]*\b(ADDRESSED|DEFENDED|STILL_OPEN)\b[^|\n]*\|/g;

const ACTION_PACKET_HEADING_PATTERN = /Required\s+Actions?\b/i;
const ACTION_PACKET_ITEM_PATTERN    = /^[ \t]*[-*][ \t]+\[[ \t]*\][ \t]*\S/;
const ACTION_PACKET_RA_PATTERN      = /^[ \t]*(?:[-*][ \t]+)?\*{0,2}RA[-_ ]?\d+\*{0,2}[ \t]*[:.)—-][ \t]*\S/i;
const MARKDOWN_FENCE_PATTERN        = /^[ \t]{0,3}(`{3,}|~{3,})/;
const MARKDOWN_HEADING_PATTERN      = /^[ \t]{0,3}#{1,6}[ \t]/;

/**
 * @summary Matches an owning-issue citation on a follow-up action line.
 *
 * A bare `#\d+` anywhere on the line was the first version and @neo-gpt falsified it at the exact head:
 * `line #42` satisfied it, so any prose number read as an owner. The reference now has to stand as its
 * own token — not glued to a preceding word — which is how an issue is actually cited, and a full
 * issue URL is accepted for the same reason.
 * @type {RegExp}
 */
const ACTION_PACKET_OWNER_PATTERN = /(?:^|[\s([<])#(\d+)\b|\/issues\/(\d+)\b/;

/**
 * @summary Words that turn a following `#N` into a coordinate rather than an owner.
 *
 * `line #42`, `column #3`, `comment #5` — each cites a coordinate rather than a ticket that accepts
 * ownership of work. Listing the coordinate words is narrower than trying to define what an owner IS.
 * @type {RegExp}
 */
const ACTION_PACKET_NON_OWNER_PATTERN = /\b(?:line|lines|col|column|row|page|step|item|note|comment|pr|commit|run|job|attempt|para|paragraph)[ \t]*#\d+/i;

/**
 * @summary Collects the action items a review body DEMANDS, scoped to its Required Actions section.
 *
 * The scope is the whole finding. An unchecked checkbox is not a demand by itself — the Micro-Delta
 * verdict block is a list of unchecked OPTIONS (`- [ ] **APPROVED**`, `- [ ] **MAINTAINER POLISH**`),
 * and a body-wide scan reads every one of them as a fresh action packet. That false positive would
 * fire on every Micro-Delta review, which is to say on the exact bodies the budget exists to permit.
 *
 * Scoping to `Required Action(s)` is not a guess about where demands live. It was derived by replaying
 * the review history that motivated this guard — the one where reviewer-pushed COMMENTED rounds walked
 * live demands past a budget that recorded a single ordinary round. Every demanded item there sat
 * under that heading, one of them spelled singular, which is why the pattern accepts both.
 *
 * **A demand is not only a checkbox.** The first version read that measured population as the whole
 * grammar and matched unchecked checkboxes alone; @neo-gpt submitted `RA-999: fix the production
 * boundary` under this very heading and it sailed through. The measured specimens are evidence about
 * what HAS been written, never permission to narrow the contract to that one form — so an `RA-N`
 * demand line counts too. Both forms stay SECTION-scoped, which is what keeps a disposition table's
 * `| RA-1 | ... |` rows (they live under `Disposition`, and are cells rather than lines) and a verdict
 * block from reading as fresh demands.
 *
 * Two exclusions fall out of the line shape rather than being special-cased:
 * - **Blockquoted** carried actions (`> - [ ] prior action`) fail the item pattern, so quoting Round 1
 *   verbatim — which a disposition round legitimately does — never reads as minting.
 * - **Fenced** blocks are skipped, so a review that SHOWS an example packet does not raise one. A
 *   fence closes only on its own marker character, so a ``` inside a ~~~ block stays content.
 *
 * Splitting on CR/LF only is deliberate. U+2028/U+2029 are ECMAScript SOURCE line terminators, which
 * is why this repo's JS parsers must honour them; GitHub markdown does not break lines on them, and
 * treating them as breaks here would import a rule from a different grammar.
 *
 * @param {String} body Review body.
 * @returns {String[]} The demanded item lines, trimmed; empty when the body demands nothing.
 */
function collectDemandedActionItems(body) {
    const lines = String(body || '').split(/\r\n|[\n\r]/),
          items = [];

    let fence     = null,
        inSection = false;

    for (const line of lines) {
        const fenceMatch = MARKDOWN_FENCE_PATTERN.exec(line);

        if (fenceMatch) {
            if      (fence === null)             fence = fenceMatch[1][0];
            else if (fenceMatch[1][0] === fence) fence = null;
            continue
        }

        if (fence !== null) continue;

        if (MARKDOWN_HEADING_PATTERN.test(line)) {
            inSection = ACTION_PACKET_HEADING_PATTERN.test(line);
            continue
        }

        if (inSection && (ACTION_PACKET_ITEM_PATTERN.test(line) || ACTION_PACKET_RA_PATTERN.test(line))) {
            items.push(line.trim())
        }
    }

    return items
}

const FOLLOWUP_PR_REVIEW_SHAPE_HINTS = [
    '# PR Review Follow-Up',
    '**Cycle:**',
    '### ⚓ Prior Review Anchor',
    '### 🔁 Delta Scope',
    '### Prior Review Anchor',
    '### Delta Scope',
    '### ✅ Previous Required Actions Audit',
    '### Previous Required Actions Audit',
    '### 🔬 Delta Depth Floor',
    '### Delta Depth Floor',
    '### 📊 Metrics Delta',
    '### Metrics Delta'
];

const MICRO_DELTA_PR_REVIEW_SHAPE_HINTS = [
    '# Pull Request Micro-Delta Review',
    '### State Vector',
    '### Micro-Delta Focus',
    '### Verdict'
];

function getFullPrReviewTemplateSkeletonAnchors() {
    return getTemplateHeadingAnchorsByLabel(PR_REVIEW_TEMPLATE_PATH, FULL_PR_REVIEW_TEMPLATE_SKELETON_LABELS, {
        fallbackByLabel: FULL_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL
    });
}

function getFollowupPrReviewTemplateSkeletonAnchors() {
    // `**Cycle:**` is no longer required. It asked which cycle number this was, and the terminal-round
    // decision removed cycle NUMBERING as a concept: there is Round 1, one disposition round, and two
    // named exceptional verdicts. A field whose only answer is "the exceptional one" measures nothing.
    return getTemplateHeadingAnchorsByLabel(PR_REVIEW_FOLLOWUP_TEMPLATE_PATH, FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_LABELS, {
        fallbackByLabel: FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL
    })
}

function getRound2PrReviewTemplateSkeletonAnchors() {
    return getTemplateHeadingAnchorsByLabel(PR_REVIEW_ROUND_2_TEMPLATE_PATH, ROUND_2_PR_REVIEW_TEMPLATE_SKELETON_LABELS, {
        fallbackByLabel: ROUND_2_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL
    })
}

const MICRO_DELTA_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS = [
    '# Pull Request Micro-Delta Review',
    '> **Context:**',
    '### State Vector',
    '- **Target SHA:**',
    '- **Origin Session ID:**',
    '- **Current reviewDecision:**',
    '- **Semantic Status:**',
    '- **CI Status:**',
    '- **Remaining Blocker Class:**',
    '- **Measured Discussion Cost:**',
    '### Micro-Delta Focus',
    '*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*',
    '### Verdict',
    '**APPROVED**',
    '**COMMENTED CLOSURE**',
    '**MAINTAINER POLISH FAST PATH APPLIED**'
];

const MICRO_DELTA_REVIEW_BLOCKER_CLASS_PATTERN = /(?:^|[^\w-])(mechanical-hygiene|metadata-drift)(?:$|[^\w-])/i;
const MICRO_DELTA_COMMENTED_CLOSURE_PATTERN    = /^\s*-\s*\[[xX]\]\s*\*\*COMMENTED CLOSURE\*\*/m;
const MICRO_DELTA_CLOSURE_PACKET_FIELDS        = [
    'Consumer sweep',
    'Falsifier/property matrix',
    'Carried-vs-new census',
    'Truth-fold',
    'Semantic-surface freeze'
];

// Micro-Review (Cycle-1, blast-scaled): a MICRO / CONTAINED PR — none of the intense triggers (ADR /
// new-subsystem / consumed-contract / security / migration) and a small diff — gets a premise+correctness
// glance, not the full gauntlet (pr-review-guide §7 blast-scaling). The minimal shape stays opt-in via the
// header so full/intense reviews keep validating heavy; the `**Class:**` token-check asserts the blast-class
// so the light path cannot be a backdoor for an intense PR. Fail SAFE toward accept: the only enforced floor
// is the header + class-assertion + a verdict + the glance — a wrongly-accepted-light review is recoverable
// (human merge gate + peer review), a wrongly-rejected valid micro-review is the theater this tier removes.
const MICRO_REVIEW_PR_REVIEW_SHAPE_HINTS = [
    '# PR Micro-Review'
];

const MICRO_REVIEW_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS = [
    '# PR Micro-Review',
    '**Class:**',
    '**Verdict:**',
    '**Glance:**'
];

const MICRO_REVIEW_CLASS_PATTERN = /(?:^|[^\w-])(micro|contained|mechanical)(?:$|[^\w-])/i;

/**
 * @summary Returns whether a review body carries a concrete Neo Memory Core origin-session UUID.
 * @param {String} body The candidate PR review body.
 * @returns {Boolean} Whether the origin-session field is present and UUID-shaped.
 */
function hasValidPrReviewOriginSession(body) {
    return PR_REVIEW_ORIGIN_SESSION_PATTERN.test(body);
}

/**
 * @summary Returns missing cycle-template skeleton anchors for review-body validation.
 *
 * The broad visible/invisible anchor layers catch metric and structural omissions. This
 * layer catches skeleton-fidelity regressions: review bodies that carry semantic anchors,
 * but rename/drop the selected template's canonical icon-bearing scaffold.
 *
 * @param {String} body The candidate PR review body.
 * @returns {String[]} Missing skeleton anchors, intentionally never exposed to callers.
 */
function getPrReviewTemplateSkeletonMisses(body) {
    // Round 2 is tested FIRST and on its own H1. It shares `### ⚓ Anchor`-adjacent vocabulary with the
    // follow-up shape, so a hint-order that checked follow-up first would validate every disposition
    // round against the exceptional template and demand sections it deliberately omits — the guard
    // would then refuse exactly the shape the terminal-round decision introduced.
    if (isRound2PrReview(body)) {
        return getRound2PrReviewTemplateSkeletonAnchors().filter(anchor => !body.includes(anchor));
    }

    const hasFollowupShape = FOLLOWUP_PR_REVIEW_SHAPE_HINTS.some(anchor => body.includes(anchor));

    if (hasFollowupShape) {
        return getFollowupPrReviewTemplateSkeletonAnchors().filter(anchor => !body.includes(anchor));
    }

    return getFullPrReviewTemplateSkeletonAnchors().filter(anchor => !body.includes(anchor));
}

/**
 * @summary Returns `true` when a review body selects the Micro-Delta template.
 *
 * The Micro-Delta path is intentionally separate from full/follow-up review shapes: it is
 * documented by the review-loop cost circuit breaker, not the normal pr-review templates,
 * and carries a narrower state-vector contract instead of the full graph metric block.
 *
 * @param {String} body The candidate PR review body.
 * @returns {Boolean} Whether the body appears to be a Micro-Delta review.
 */
function isMicroDeltaPrReview(body) {
    return body.includes(MICRO_DELTA_PR_REVIEW_SHAPE_HINTS[0]) || (
        body.includes('### State Vector') &&
        body.includes('### Micro-Delta Focus')
    );
}

/**
 * @summary Returns missing documented Micro-Delta anchors.
 *
 * Micro-Delta reviews are only valid after semantics are cleared and the remaining issue
 * class is mechanical hygiene or metadata drift. The blocker-class token check prevents
 * the short format from becoming
 * a backdoor for semantic review shortcuts.
 *
 * @param {String} body The candidate Micro-Delta PR review body.
 * @returns {String[]} Missing Micro-Delta anchors or state constraints.
 */
function getMicroDeltaPrReviewTemplateMisses(body) {
    const misses = MICRO_DELTA_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS
        .filter(anchor => !body.includes(anchor));

    if (!hasValidPrReviewOriginSession(body)) {
        misses.push('Origin Session ID: Neo Memory Core UUID');
    }

    const remainingBlockerLine = body
        .split('\n')
        .find(line => line.includes('- **Remaining Blocker Class:**')) || '';

    if (!MICRO_DELTA_REVIEW_BLOCKER_CLASS_PATTERN.test(remainingBlockerLine)) {
        misses.push('Remaining Blocker Class: mechanical-hygiene | metadata-drift');
    }

    if (MICRO_DELTA_COMMENTED_CLOSURE_PATTERN.test(body)) {
        if (!body.includes('### RC2 Closure Packet')) {
            misses.push('RC2 Closure Packet');
        }

        MICRO_DELTA_CLOSURE_PACKET_FIELDS.forEach(label => {
            const prefix = `- **${label}:**`;
            const line   = body.split('\n').find(candidate => candidate.trim().startsWith(prefix));
            const value  = line ? line.trim().slice(prefix.length).trim() : '';

            if (!value || /^\[.*\]$/.test(value) || /^(?:todo|tbd)$/i.test(value)) {
                misses.push(label);
            }
        });
    }

    return misses;
}

/**
 * @summary Returns a structured validation failure for malformed Micro-Delta review bodies.
 *
 * @param {String} body The candidate Micro-Delta PR review body.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
/**
 * @summary Validates an ordinary Round-2 disposition review against its own minimal floor.
 *
 * Round 2 gets its OWN tier rather than routing through the canonical path, for the same reason
 * Micro-Delta does: the canonical validator requires the four premise anchors on every body, and a
 * disposition round deliberately carries no premise snapshot. Routed canonically it would be refused
 * for omitting exactly what the terminal-round decision removed — the guard would enforce the shape
 * the substrate replaced.
 *
 * The floor is the four structural anchors and nothing else. It fails SAFE toward accept, because the
 * expensive failure here is a reviewer who cannot post a legitimate disposition and re-opens a heavy
 * round to get past the gate.
 *
 * @param {String} body The candidate PR review body.
 * @returns {Object|null} Validation failure payload, or `null` when valid.
 */
function getRound2PrReviewTemplateValidationFailure(body) {
    const
        missing  = getRound2PrReviewTemplateSkeletonAnchors().filter(anchor => !body.includes(anchor)),
        // Heading presence was the ENTIRE gate here, and @neo-gpt falsified it at review with a body
        // carrying the four headings, no prior round, no origin, and an invented `RA-999` — zero
        // missing anchors, admitted. That is the anti-Goodhart failure this file already knew about:
        // `INVISIBLE_PR_REVIEW_ANCHORS` exists precisely because a gate that names its anchors gets
        // satisfied by writing them, and the new tier reproduced the defect one tier along.
        //
        // A format gate cannot prove a disposition OCCURRED — that needs the prior round, and the
        // caller holding PR context owns it. What a body-only gate can prove is that this document
        // is SHAPED like a disposition rather than a first review wearing its headings: it points at
        // a real prior round, it dispositions at least one row, every disposition is a defined verb,
        // and it mints no fresh action packet. Those are checkable here and each one is a way the
        // falsifier passed.
        defects  = [];

    if (missing.length > 0) {
        defects.push(`omits its structural anchors — missing: ${missing.join(', ')}`)
    }

    // The anchor must POINT somewhere. A Round 2 that cannot name the round it dispositions is a
    // first review, and the template's bracketed placeholders must not survive into a posted body.
    if (!/\*\*Round-1 Review ID:\*\*\s*(?!\[)\S/.test(body)) {
        defects.push('names no Round-1 review to disposition — `**Round-1 Review ID:**` is absent, empty, or still the template placeholder')
    }

    // The SAME constant CI's Round-2 branch already used. The two copies of this contract disagreed
    // here — CI required a valid origin line for a Round 2 and the managed service did not — so a body
    // the service admitted could still fail the post-submit lint, which is the split that makes having
    // two copies dangerous rather than merely redundant.
    if (!PR_REVIEW_ORIGIN_SESSION_PATTERN.test(body)) {
        defects.push('carries no `Origin Session ID:` line with a full Memory Core UUID on its own line')
    }

    const dispositions = [...body.matchAll(ROUND_2_DISPOSITION_ROW_PATTERN)];

    if (dispositions.length === 0) {
        defects.push('dispositions nothing — the table needs one row per Round-1 required action, each marked ADDRESSED, DEFENDED, or STILL_OPEN')
    }

    // A disposition round that opens a checkbox action list is the exact behaviour the format exists
    // to stop: a second round restating, renumbering, or expanding the first round's demands. The
    // carried actions live in the table; a `- [ ]` list is a NEW packet by construction.
    if (/^[ \t]*[-*][ \t]+\[[ x]\]/im.test(body)) {
        defects.push('mints a new action checklist — an ordinary Round 2 carries prior actions in the disposition table and never opens a fresh packet. A STILL_OPEN row keeps the original review authoritative instead')
    }

    if (defects.length === 0) return null;

    return {
        error  : 'PR Review Template Validation Failed',
        message: [
            'Review body selects the Round-2 disposition format but does not satisfy it.',
            '',
            `**Required action**: read \`.agents/skills/pr-review/assets/pr-review-round-2-template.md\` before retrying.`,
            '',
            'Round 2 is a disposition over the Round-1 required actions, quoted verbatim — an anchor block,',
            'the disposition table, and a verdict. If this round needs a premise snapshot or an audit rerun,',
            'it is not an ordinary Round 2: it is a validated Drop+Supersede or a guarded repair-minted',
            're-entry, and both use the follow-up template.',
            '',
            ...defects.map(defect => `- This body ${defect}.`)
        ].join('\n'),
        code: 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED'
    }
}

function getMicroDeltaPrReviewTemplateValidationFailure(body) {
    const missingMicroDelta = getMicroDeltaPrReviewTemplateMisses(body);

    if (missingMicroDelta.length === 0) {
        return null;
    }

    const skillPath      = '.agents/skills/pr-review/SKILL.md';
    const circuitPath    = '.agents/skills/pr-review/audits/review-cost-circuit-breaker.md';
    const microDeltaPath = '.agents/skills/pr-review/assets/pr-review-micro-delta-template.md';

    const message = [
        `Review body attempts the Micro-Delta Review format but does not match the documented circuit-breaker structure.`,
        ``,
        `**Required action**: read \`${skillPath}\`, \`${circuitPath}\`, and \`${microDeltaPath}\` BEFORE retrying.`,
        ``,
        `Micro-Delta reviews are only valid after semantic review is complete, with only`,
        `mechanical-hygiene or metadata-drift remaining. If a semantic or contract delta exists, use the`,
        `full follow-up review template instead.`,
        ``,
        missingMicroDelta.includes('Origin Session ID: Neo Memory Core UUID')
            ? `Origin-session note: provide the reviewer's Neo Memory Core session UUID, not a harness, task, or transcript identifier.\n`
            : ``,
        `Diagnostic hint: at least one required Micro-Delta state-vector or verdict anchor from \`${microDeltaPath}\` is missing or invalid.`
    ].join('\n');

    return {
        error              : 'PR Review Template Validation Failed',
        message,
        code               : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
        missing_micro_delta: missingMicroDelta,
        skill              : skillPath,
        circuitBreaker     : circuitPath,
        template           : microDeltaPath
    };
}

/**
 * @summary Returns a structured validation failure for malformed full/follow-up review bodies.
 *
 * @param {String} body The candidate PR review body.
 * @param {Object}  [options]
 * @param {Boolean} [options.includeTemplateDiagnostics=false] Include exact skeleton misses for read-only preflight.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getCanonicalPrReviewTemplateValidationFailure(body, {includeTemplateDiagnostics = false} = {}) {
    const missingVisible          = VISIBLE_PR_REVIEW_ANCHORS          .filter(anchor => !body.includes(anchor));
    const missingInvisible        = INVISIBLE_PR_REVIEW_ANCHORS        .filter(anchor => !body.includes(anchor));
    const missingTemplateSkeleton = getPrReviewTemplateSkeletonMisses(body);
    const missingPremiseSnapshot  = REQUIRED_PR_REVIEW_PREMISE_ANCHORS
        .filter(anchor => !body.includes(anchor.token))
        .map(anchor => anchor.label);
    const missingOriginSession = hasValidPrReviewOriginSession(body)
        ? []
        : ['Origin Session ID: Neo Memory Core UUID'];

    if (
        missingVisible.length === 0          &&
        missingInvisible.length === 0        &&
        missingTemplateSkeleton.length === 0 &&
        missingPremiseSnapshot.length === 0  &&
        missingOriginSession.length === 0
    ) {
        return null;
    }

    // Compose a message that guides toward the skill without enumerating invisible anchors.
    // Even the visible-list naming is bounded — at most ONE diagnostic example, not the
    // full list — to reduce the "stuff just these tags" attack surface further.
    const diagnosticAnchor = missingVisible[0] ?? missingPremiseSnapshot[0] ?? missingOriginSession[0] ?? null;

    const skillPath    = '.agents/skills/pr-review/SKILL.md';
    const templatePath = PR_REVIEW_TEMPLATE_PATH;
    const followupPath = PR_REVIEW_FOLLOWUP_TEMPLATE_PATH;

    const message = [
        `Review body does not match the pr-review template structure.`,
        ``,
        `**Required action**: read \`${skillPath}\` BEFORE retrying. The skill points at:`,
        `  - Cycle 1 (full template): \`${templatePath}\``,
        `  - Cycle N (follow-up template): \`${followupPath}\``,
        ``,
        `Do NOT compose a substitute template or hallucinate section headings. The validator`,
        `checks more structural anchors than this error names. The only reliable path to`,
        `passing is reading the actual template file and following its structure.`,
        missingPremiseSnapshot.length > 0
            ? `\nPremise snapshot note: all four premise fields (incl. **Premise Coherence:**) are REQUIRED. The value-coherence field takes a specific verdict ("coheres: ..." / "conflicts: ...") OR a scoped "N/A — no value-surface (scope: ...)" for a trivial PR.`
            : ``,
        missingOriginSession.length > 0
            ? `\nOrigin-session note: provide the reviewer's Neo Memory Core session UUID, not a harness, task, or transcript identifier.`
            : ``,
        diagnosticAnchor
            ? `\nDiagnostic hint: at least one recognized anchor like \`${diagnosticAnchor}\` is missing.`
            : `\nDiagnostic hint: visible metric tags appear present but the structural template anchors do not.`
    ].join('\n');

    const failure = {
        error: 'PR Review Template Validation Failed',
        message,
        code : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
        // `missing_visible` lists the named-in-message visible misses. Invisible misses
        // are intentionally NOT enumerated in the response body — even programmatic
        // callers should be nudged toward the skill rather than the anchor list.
        missing_visible         : missingVisible,
        missing_origin_session  : missingOriginSession,
        missing_premise_snapshot: missingPremiseSnapshot,
        skill                   : skillPath,
        template                : templatePath
    };

    if (includeTemplateDiagnostics) {
        failure.missing_template_skeleton = missingTemplateSkeleton;
    }

    return failure;
}

/**
 * @summary Returns `true` when a review body opts into the Micro-Review (Cycle-1 blast-scaled) shape.
 * @param {String} body The candidate PR review body.
 * @returns {Boolean} Whether the body selects the Micro-Review light path.
 */
function isMicroReview(body) {
    return MICRO_REVIEW_PR_REVIEW_SHAPE_HINTS.some(anchor => body.includes(anchor));
}

/**
 * @summary Returns missing Micro-Review anchors (the minimal blast-scaled floor).
 *
 * Micro-Reviews are the Cycle-1 light path for a micro/contained PR (pr-review-guide §7 blast-scaling).
 * The floor is intentionally minimal — header + `**Class:**` (asserting `micro`|`contained`, so the light
 * path is not a backdoor for an intense PR) + `**Verdict:**` + `**Glance:**` (the premise+correctness check).
 *
 * @param {String} body The candidate Micro-Review body.
 * @returns {String[]} Missing anchors or the class-assertion constraint.
 */
function getMicroReviewTemplateMisses(body) {
    const misses = MICRO_REVIEW_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS
        .filter(anchor => !body.includes(anchor));

    const classLine = body.split('\n').find(line => line.includes('**Class:**')) || '';

    if (!MICRO_REVIEW_CLASS_PATTERN.test(classLine)) {
        misses.push('Class: micro | contained (the blast-class assertion)');
    }

    return misses;
}

/**
 * @summary Returns a structured validation failure for malformed Micro-Review bodies.
 *
 * @param {String} body The candidate Micro-Review body.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getMicroReviewTemplateValidationFailure(body) {
    const missing = getMicroReviewTemplateMisses(body);

    if (missing.length === 0) {
        return null;
    }

    const skillPath = '.agents/skills/pr-review/SKILL.md';

    const message = [
        `Review body attempts the Micro-Review format but does not match its minimal shape.`,
        ``,
        `The Micro-Review (Cycle-1, blast-scaled per pr-review-guide §7) is for a MECHANICAL PR with`,
        `no architectural concept to teach (test / config-leaf / behavior-preserving), ANY size — so no`,
        `\`[ARCH_ALIGNMENT]\` / \`[RETROSPECTIVE]\` graph-ingestion is lost (the gate that keeps the concept-graph`,
        `fed). It needs only: the header, **Class:** (asserting micro | contained | mechanical), **Verdict:**,`,
        `and **Glance:** (the premise + correctness check). A concept-bearing PR — touches an ADR / new`,
        `abstraction / consumed contract / security / migration — uses the full template instead, regardless of size.`
    ].join('\n');

    return {
        error               : 'PR Review Template Validation Failed',
        message,
        code                : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
        missing_micro_review: missing,
        skill               : skillPath
    };
}

/**
 * @summary Reads one exact Drop+Supersede contract field from a review body.
 * @param {String} body Review body.
 * @param {String} label Bold field label without punctuation.
 * @returns {String} Trimmed field value, or an empty string when absent.
 */
function getDropSupersedeContractField(body, label) {
    const prefix = `- **${label}:**`;
    const line   = body.split('\n').find(candidate => candidate.trim().startsWith(prefix));

    return line ? line.trim().slice(prefix.length).trim() : ''
}

/**
 * @summary Classifies exact Drop+Supersede intent and its structural completeness contract.
 *
 * This deliberately validates structure, not the truth of the cited evidence. Exact decision
 * lines avoid treating the unfilled template's option list as a terminal verdict.
 *
 * @param {String} body Review body.
 * @returns {{intent: Boolean, valid: Boolean, disposition: String, missing: String[]}}
 */
function classifyDropSupersedeReview(body) {
    const lines          = body.split('\n').map(line => line.trim());
    const statusIntent   = lines.includes('**Status:** Drop+Supersede');
    const decisionIntent = lines.includes('- **Decision**: Drop+Supersede');
    const intent         = statusIntent || decisionIntent;

    if (!intent) {
        return {intent: false, valid: false, disposition: '', missing: []}
    }

    const disposition = getDropSupersedeContractField(body, 'Disposition');
    const missing     = [];

    if (!statusIntent || !decisionIntent) {
        missing.push('Status + Decision: Drop+Supersede')
    }

    if (!DROP_SUPERSEDE_DISPOSITIONS.has(disposition)) {
        missing.push('Disposition: implementation-off | ticket-prescription-off | ticket-premise-dead')
    }

    DROP_SUPERSEDE_CONTRACT_FIELDS.forEach(label => {
        const value = getDropSupersedeContractField(body, label);

        if (!value || /^\[.*\]$/.test(value) || /^(?:todo|tbd)$/i.test(value)) {
            missing.push(label)
        }
    });

    if (isMicroDeltaPrReview(body)) {
        missing.push('Drop+Supersede requires the full or follow-up review template')
    }

    return {
        intent: true,
        valid : missing.length === 0,
        disposition,
        missing
    }
}

/**
 * @summary Returns a structured failure when a terminal Drop+Supersede body is incomplete.
 * @param {String} body Review body.
 * @returns {Object|null} Validation failure or `null`.
 */
function getDropSupersedeValidationFailure(body) {
    const classification = classifyDropSupersedeReview(body);

    if (!classification.intent || classification.valid) return null;

    return {
        error                 : 'Drop+Supersede Contract Validation Failed',
        message               : 'A Drop+Supersede verdict must carry the disposition, source-coordinate falsifiers, salvage map, successor landing pad, and successor map citation defined by pr-review §9.',
        code                  : 'DROP_SUPERSEDE_CONTRACT_VALIDATION_FAILED',
        missing_drop_supersede: classification.missing,
        skill                 : '.agents/skills/pr-review/SKILL.md',
        template              : isMicroDeltaPrReview(body)
            ? '.agents/skills/pr-review/assets/pr-review-micro-delta-template.md'
            : PR_REVIEW_FOLLOWUP_TEMPLATE_PATH
    }
}

/**
 * @summary Returns the selected review-template validation failure, if any.
 *
 * Tier dispatch (most-specific first): an opt-in Micro-Review (Cycle-1 blast-scaled light shape) → a
 * Micro-Delta (Cycle-N cost-compression) → else the canonical full/follow-up template. The blast-scaled
 * tiers fail SAFE toward accept (a minimal floor); the canonical path keeps validating heavy for
 * full/intense reviews.
 *
 * @param {String} body The candidate PR review body.
 * @param {Object}  [options]
 * @param {Boolean} [options.includeTemplateDiagnostics=false] Include exact skeleton misses for read-only preflight.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getPrReviewTemplateValidationFailure(body, options) {
    let failure;

    if (isMicroReview(body)) {
        failure = getMicroReviewTemplateValidationFailure(body)
    } else if (isRound2PrReview(body)) {
        failure = getRound2PrReviewTemplateValidationFailure(body)
    } else {
        failure = isMicroDeltaPrReview(body)
            ? getMicroDeltaPrReviewTemplateValidationFailure(body)
            : getCanonicalPrReviewTemplateValidationFailure(body, options)
    }

    return failure || getDropSupersedeValidationFailure(body)
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getReviewSubmittedMs(review) {
    const time = Date.parse(review?.submittedAt || '');

    return Number.isFinite(time) ? time : 0
}

function isAcknowledgedRequestChangesDisposition(value, headRefOid) {
    if (typeof value !== 'string') return false;

    const disposition = value.trim();

    if (disposition.startsWith(ACKNOWLEDGED_RC_EVIDENCE_PREFIX)) {
        return disposition.slice(ACKNOWLEDGED_RC_EVIDENCE_PREFIX.length).trim().length > 0
    }

    if (!disposition.startsWith(ACKNOWLEDGED_RC_ADDRESSED_PREFIX)) return false;

    const sha = disposition.slice(ACKNOWLEDGED_RC_ADDRESSED_PREFIX.length).trim();

    return /^[0-9a-f]{7,40}$/i.test(sha) && headRefOid.startsWith(sha)
}

/**
 * @summary Finds current-head request-changes reviews that have not been superseded by the same reviewer.
 * GitHub review comments do not clear a formal `CHANGES_REQUESTED`; only a later approving, dismissed,
 * or request-changes review from the same reviewer changes the disposition this gate consumes.
 * @param {Object} pullRequest PR GraphQL node including `headRefOid` and `reviews.nodes`.
 * @returns {Object[]|null} Outstanding reviewer records, or `null` when the live-state shape is incomplete.
 */
function getOutstandingRequestChanges(pullRequest) {
    const
        headRefOid = pullRequest?.headRefOid,
        reviews    = pullRequest?.reviews?.nodes;

    if (!Array.isArray(reviews) || !headRefOid) return null;

    const latestByReviewer = new Map();

    [...reviews]
        .filter(review => review?.author?.login && review?.commit?.oid === headRefOid)
        .sort((a, b) => getReviewSubmittedMs(a) - getReviewSubmittedMs(b))
        .forEach(review => {
            if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) {
                latestByReviewer.set(review.author.login, review)
            }
        });

    return [...latestByReviewer.values()]
        .filter(review => review.state === 'CHANGES_REQUESTED')
        .map(review => ({
            reviewer   : review.author.login,
            state      : review.state,
            commitOid  : review.commit?.oid,
            submittedAt: review.submittedAt,
            url        : review.url,
            databaseId : review.databaseId
        }))
}

/**
 * @summary Builds the fail-closed response for APPROVED reviews over live request-changes state.
 * The MCP boundary requires explicit reviewer-keyed acknowledgments so approval intent cannot erase an
 * unaddressed `CHANGES_REQUESTED` review by body-template validity alone.
 * @param {Object} options Validation options.
 * @param {Object} [options.acknowledgedRequestChanges] Reviewer-login to disposition map.
 * @param {Number} options.pr_number Pull request number.
 * @param {Object} options.pullRequest PR GraphQL node including review state.
 * @returns {Object|null} Structured validation failure, or `null` when approval can proceed.
 */
function getPrReviewStateValidationFailure({acknowledgedRequestChanges, pr_number, pullRequest}) {
    const headRefOid = pullRequest?.headRefOid,
          reviews    = pullRequest?.reviews?.nodes;

    if (!headRefOid || !Array.isArray(reviews)) {
        return {
            error  : 'PR Review State Validation Failed',
            message: `Cannot validate live review state for PR #${pr_number}; GitHub did not return headRefOid + review nodes. Refusing to submit APPROVED review.`,
            code   : 'PR_REVIEW_STATE_VALIDATION_FAILED'
        }
    }

    const outstanding = getOutstandingRequestChanges(pullRequest);

    if (!outstanding?.length) return null;

    const ack     = isPlainObject(acknowledgedRequestChanges) ? acknowledgedRequestChanges : null,
          missing = outstanding
              .map(({reviewer}) => reviewer)
              .filter(reviewer => !ack || !Object.hasOwn(ack, reviewer)),
          invalid = ack
              ? outstanding
                  .map(({reviewer}) => reviewer)
                  .filter(reviewer => Object.hasOwn(ack, reviewer) && !isAcknowledgedRequestChangesDisposition(ack[reviewer], headRefOid))
              : [];

    if (!missing.length && !invalid.length) return null;

    const reviewerList = outstanding
        .map(({reviewer, submittedAt, url}) => `@${reviewer}${submittedAt ? ` at ${submittedAt}` : ''}${url ? ` (${url})` : ''}`)
        .join(', ');

    return {
        error  : 'PR Review State Validation Failed',
        message: [
            `Cannot create APPROVED review on PR #${pr_number} while current head ${headRefOid} has outstanding CHANGES_REQUESTED review(s): ${reviewerList}.`,
            `Before retrying, follow pr-review §9.1 Reviewer-Yield: either address the request-changes at the current head or provide superior empirical evidence.`,
            `Pass acknowledgedRequestChanges as an object mapping each RC reviewer login to '${ACKNOWLEDGED_RC_ADDRESSED_PREFIX}${headRefOid.slice(0, 12)}' or '${ACKNOWLEDGED_RC_EVIDENCE_PREFIX} <specific evidence>'.`,
            missing.length ? `Missing acknowledgment(s): ${missing.map(reviewer => `@${reviewer}`).join(', ')}.` : null,
            invalid.length ? `Invalid acknowledgment disposition(s): ${invalid.map(reviewer => `@${reviewer}`).join(', ')}.` : null
        ].filter(Boolean).join(' '),
        code                     : 'PR_REVIEW_STATE_VALIDATION_FAILED',
        headRefOid,
        reviewDecision           : pullRequest.reviewDecision,
        outstandingRequestChanges: outstanding
    }
}

/**
 * @summary Refuses a COMMENT that mints a fresh action packet, in any budget state.
 *
 * **This guard used to be budget-scoped, and that was the defect.** It refused a demand-bearing COMMENT
 * only once the family had spent an ordinary `CHANGES_REQUESTED` round — so a family that simply never
 * chose that enum was never post-budget, and could push demand after demand through COMMENT forever.
 * @neo-gpt drove it at the exact head: the same packet was admitted after zero, one, and two prior
 * same-family demand COMMENTs. The guard rebuilt the very loophole it was written to close, one layer
 * up, because it still bound on a review STATE while claiming to bind on demand SUBSTANCE.
 *
 * So the rule is now stateless: a managed COMMENT may not raise a new action packet at all. That is
 * not a stricter version of the old rule, it is the honest one — a review demanding author action IS a
 * request for changes, and routing it there is what makes the budget count it. The first demand is a
 * `REQUEST_CHANGES` (which spends the family's round); afterwards the disposition carries the existing
 * actions, and fresh findings are accepted risk or a ticket the reviewer owns.
 *
 * What refuses is still the PACKET, never the channel. A COMMENT carrying a disposition, a closure
 * packet, or plain commentary is untouched — the disposition contract REQUIRES a `STILL_OPEN` round to
 * be COMMENT, so refusing the channel would forbid the exact round this contract exists to make
 * reachable.
 *
 * Being stateless also removes every fail-open precondition the budget-scoped version needed (cutover
 * resolution, provable review history, a classifiable reviewer). Each of those was a way to be right
 * about the demand and admit it anyway, and each is now gone. The same rule then applies identically
 * on `create` and on `update`, which is the property the create-only version lacked.
 *
 * @param {Object}        options
 * @param {String}        options.body    Incoming review body.
 * @param {Number|String} options.subject PR number or review id, for the message.
 * @returns {Object|null} Failure payload, or null when the comment is permitted.
 */
function getCommentActionPacketFailure({body, subject}) {
    const demanded = collectDemandedActionItems(body);

    if (demanded.length === 0) return null;

    return {
        error  : 'PR Review Action Packet Validation Failed',
        message: [
            `This COMMENT on ${subject} raises ${demanded.length} new required-action item(s).`,
            'A COMMENT carries a disposition over EXISTING actions; it does not open a new packet, in any budget state —',
            'otherwise the ordinary round stays avoidable by never choosing the REQUEST_CHANGES state.',
            'Submit the first demand round as REQUEST_CHANGES (which spends your family\'s ordinary round), post the',
            'disposition (STILL_OPEN preserves the original review\'s authority), APPROVE when merge-safe, or one',
            'validated Drop+Supersede. A fresh finding after the round is spent is accepted risk, or a ticket you own.'
        ].join(' '),
        code               : 'PR_REVIEW_ACTION_PACKET_REFUSED',
        demandedActionItems: demanded.length
    }
}

/**
 * @summary Refuses an APPROVE whose follow-up actions name no owning issue.
 *
 * Plain APPROVE is the default merge-safe terminal outcome, and Approve-with-Follow-Up must validate
 * the standalone-ticket counterfactual and independent ownership. That rule existed only as prose —
 * before this guard the string `A+FU` appeared nowhere under `ai/`, only in the skill payloads — so on
 * this one decision the reviewer's two options were an enforced rule and an unenforced one, which is
 * not a choice between equals. This is the enforcement half; the payload keeps the rule's statement.
 *
 * Ownership is the checkable core of "standalone-ticket counterfactual": required work either has a
 * ticket someone owns, or it is accepted risk. What an approval cannot do is leave work demanded and
 * unowned at the moment the PR becomes mergeable — the point after which nobody is looking.
 *
 * **Independent is the load-bearing word, and two ways of failing it are checkable offline.** A
 * coordinate is not an owner: `line #42` cites a place, not a ticket accepting work, and the first
 * version of this guard accepted it. Nor is this PR's own close target: an item pointing at the ticket
 * the approval closes describes work the merge is about to declare finished, which is the precise
 * opposite of independent follow-up. Both were @neo-gpt's findings, and the second had been encoded as
 * this suite's POSITIVE fixture — the anti-pattern shipped as its own proof.
 *
 * What is NOT checked here is whether the cited issue exists and is open, which needs a tracker read.
 * The admission path deliberately resolves identity from a startup cache rather than over the network
 * (see the reviewer-login note at the budget call site) precisely so a submission cannot fail for
 * reasons unrelated to the review being judged; adding N issue lookups per approval reintroduces
 * exactly that. Existence belongs in the post-submit audit path, which already reads the tracker.
 *
 * Deliberately NOT budget-scoped. The governing rule states no cutover condition, and this is about
 * the shape of an approval rather than about a spent round, so a grandfathered PR gets it too.
 *
 * @param {Object}        options
 * @param {String}        options.body           Incoming review body.
 * @param {Number[]}      [options.closeTargets] Issue numbers this PR closes; each is a non-owner.
 * @param {Number|String} options.subject        PR number or review id, for the message.
 * @returns {Object|null} Failure payload, or null when the approval is permitted.
 */
function getApproveFollowUpOwnershipFailure({body, closeTargets = [], subject}) {
    const unowned = collectDemandedActionItems(body).filter(item => {
        if (ACTION_PACKET_NON_OWNER_PATTERN.test(item)) return true;

        const match = ACTION_PACKET_OWNER_PATTERN.exec(item);

        if (!match) return true;

        return closeTargets.includes(Number(match[1] ?? match[2]))
    });

    if (unowned.length === 0) return null;

    return {
        error  : 'PR Review Follow-Up Ownership Validation Failed',
        message: [
            `This APPROVE on ${subject} carries ${unowned.length} required-action item(s) that name no INDEPENDENT owning issue.`,
            'Plain APPROVE is the default merge-safe terminal outcome. If the work is genuinely required it belongs to a',
            'ticket someone owns, and the item must cite that ticket as its own reference (`#N` or an issue URL) — a',
            'coordinate such as `line #42` names a place, and this PR\'s own close target names work the merge is about',
            'to call finished. If it is not worth an independent ticket it is accepted risk, and does not belong in an',
            'approval\'s action list at all.'
        ].join(' '),
        code                : 'PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED',
        unownedFollowUpItems: unowned.length
    }
}

/**
 * @summary The issue numbers an approval's follow-up items cite as their owners.
 * @param {String} body Review body.
 * @returns {Number[]} Distinct cited issue numbers; empty when the approval carries no follow-up.
 */
function collectFollowUpOwnerNumbers(body) {
    const numbers = new Set();

    for (const item of collectDemandedActionItems(body)) {
        const match = ACTION_PACKET_OWNER_PATTERN.exec(item);

        if (match) numbers.add(Number(match[1] ?? match[2]))
    }

    return [...numbers]
}

/**
 * @summary Refuses an approval whose cited follow-up owner does not exist, or is already closed.
 *
 * I defended leaving this out on the grounds that admission must not make network round trips — the
 * budget resolves the reviewer login from a startup cache for exactly that reason. @neo-gpt held that
 * admission is the right layer and demonstrated why at the exact head: a closed issue and a
 * nonexistent one both satisfied the lexical check and reached the mutation. A reference that resolves
 * to nothing is not ownership, and an approval is the last moment anyone looks.
 *
 * The cost objection dissolves rather than being overruled. The lookup is ONE batched request for any
 * number of citations, and it is issued **only when the approval actually carries follow-up items** —
 * so a plain APPROVE, the default and by far the common case, still performs zero extra work.
 *
 * Fails OPEN on an unreadable answer, deliberately and in the opposite direction from the budget's
 * refusals. This gate sits on the merge-safe terminal: refusing an approval because GitHub hiccuped
 * blocks the path the whole contract is trying to make reachable, while admitting an unverifiable
 * citation leaves work owned-on-paper that the post-submit audit can still surface. Only a definite
 * answer — the issue is absent, or its state is `CLOSED` — refuses.
 *
 * @param {Object}   options
 * @param {String}   options.body      Incoming review body.
 * @param {Number[]} options.numbers   Cited owner issue numbers.
 * @param {Object}   options.states    `{[number]: 'OPEN'|'CLOSED'|null}` as resolved from GitHub.
 * @param {String}   options.subject   PR number or review id, for the message.
 * @returns {Object|null} Failure payload, or null when every citation resolves to an open issue.
 */
function getFollowUpOwnerResolutionFailure({numbers, states, subject}) {
    const missing = numbers.filter(number => states[number] === null || states[number] === undefined),
          closed  = numbers.filter(number => states[number] === 'CLOSED');

    if (missing.length === 0 && closed.length === 0) return null;

    return {
        error  : 'PR Review Follow-Up Ownership Validation Failed',
        message: [
            `This APPROVE on ${subject} cites follow-up owners that do not accept work:`,
            missing.length ? `no such issue — ${missing.map(number => `#${number}`).join(', ')}.` : '',
            closed.length  ? `already closed — ${closed.map(number => `#${number}`).join(', ')}.` : '',
            'A citation that resolves to nothing, or to finished work, is not ownership — it is the appearance of it,',
            'recorded at the last moment anyone looks. File the follow-up, cite the open issue, or drop the item and',
            'accept the risk.'
        ].filter(Boolean).join(' '),
        code                    : 'PR_REVIEW_FOLLOW_UP_OWNERSHIP_FAILED',
        unresolvedFollowUpOwners: [...missing, ...closed]
    }
}

/**
 * @summary Reads the close targets a PR body declares, so a follow-up cannot cite one as its owner.
 * @param {String} body PR body.
 * @returns {Number[]} Issue numbers named by a standalone close keyword.
 */
function collectPrCloseTargets(body) {
    return [...String(body || '').matchAll(/^[ \t]*(?:Resolves|Closes|Fixes)[ \t]+#(\d+)/gim)].map(match => Number(match[1]))
}

function getReviewBudgetFailure(pr_number, message, audit = {}) {
    return {
        error: 'PR Review Budget Validation Failed',
        message,
        code : 'PR_REVIEW_BUDGET_VALIDATION_FAILED',
        // `COMMENT` is qualified rather than listed bare. @neo-kimi-phoebe's reading was that the
        // overflow valve lived in this very message: it named the channel that skipped the budget, so
        // the refusal doubled as directions to the way around itself.
        permittedNextStates: ['APPROVED', 'COMMENT carrying the disposition over the existing actions', 'validated Drop+Supersede'],
        reviewBudget       : audit,
        pr_number
    }
}

/**
 * @summary Parses a repair-minted re-entry receipt out of an override disclosure.
 *
 * The exceptional second round exists for exactly one situation: a defect that did NOT exist, or was
 * undiscoverable, at the head Round 1 reviewed — and that the author's own repair created or exposed.
 * "I noticed it later" is not that situation, and free prose cannot tell the two apart. So the receipt
 * names four things and each is checked against something outside the sentence:
 *
 * - `old-head` must be a head some prior review was actually submitted against. This is the clause
 *   that makes the receipt falsifiable rather than merely well-formed: it is verified against the PR's
 *   own review population, so a receipt cannot invent the history it claims to have reviewed.
 * - `new-head` must differ from `old-head`. A re-entry across an unchanged head describes no repair.
 * - `prior-fact` states what about the old head made the defect nonexistent or undiscoverable.
 * - `repair-coordinate` names where the repair created or exposed it.
 *
 * Deliberately not a free-text reason with a length rule. A single-line non-empty check accepts
 * "release safety exception", which asserts nothing checkable and is indistinguishable from the
 * ordinary later discovery this clause refuses.
 * @param {String} reason Trimmed single-line disclosure.
 * @param {String[]} priorHeads Commit oids that prior submitted reviews were made against.
 * @param {String} currentHead The PR head this review is being submitted against.
 * @returns {{valid: Boolean, missing: String[], fields: Object, failure: String|null}}
 */
function parseRepairMintedReceipt(reason, priorHeads = [], currentHead = '') {
    const
        fields  = {},
        pattern = /(old-head|new-head|prior-fact|repair-coordinate)\s*:\s*([^|]+)/g;

    for (const match of reason.matchAll(pattern)) fields[match[1]] = match[2].trim();

    const missing = ['old-head', 'new-head', 'prior-fact', 'repair-coordinate'].filter(key => !fields[key]);

    if (missing.length) return {valid: false, missing, fields, failure: null};

    if (fields['old-head'] === fields['new-head']) {
        return {valid: false, missing, fields, failure: 'old-head and new-head are identical, so the receipt describes no repair between them.'}
    }

    // The falsifiable clause. Everything above checks the sentence against itself; this checks it
    // against the PR's own history, which is the only part a mistaken or invented receipt cannot
    // satisfy by being better written.
    // `priorHeads` carries ONLY the spending family's prior review heads. Checking against every
    // family's heads let a GPT re-entry cite a head only Claude ever reviewed — the causal claim is
    // "the defect did not exist at the head I reviewed", so a head someone else reviewed proves
    // nothing about this family's Round 1.
    //
    // An EMPTY set refuses rather than skipping. The earlier `priorHeads.length &&` short-circuit
    // meant that when commit evidence was missing, the one clause a receipt cannot talk its way past
    // simply stopped running — reversing the guard exactly where evidence is unavailable, which is
    // where a false receipt is most likely and least detectable.
    if (priorHeads.length === 0) {
        return {
            valid  : false,
            missing,
            fields,
            failure: 'No prior review head is recorded for this family, so the receipt\'s old-head cannot be corroborated. Refusing rather than accepting an uncheckable causal claim.'
        }
    }

    if (!priorHeads.includes(fields['old-head'])) {
        return {
            valid  : false,
            missing,
            fields,
            failure: `old-head ${fields['old-head']} matches no head THIS family submitted a prior review against (${priorHeads.join(', ')}).`
        }
    }

    if (currentHead && fields['new-head'] !== currentHead) {
        return {
            valid  : false,
            missing,
            fields,
            failure: `new-head ${fields['new-head']} is not the head under review (${currentHead}); a repair-minted re-entry is bound to the repaired head.`
        }
    }

    return {valid: true, missing: [], fields, failure: null}
}

/**
 * @summary Validates and normalizes the named review-budget override disclosure.
 * @param {*} value Candidate override reason.
 * @returns {{provided: Boolean, valid: Boolean, reason: String}}
 */
function normalizeReviewBudgetOverrideReason(value) {
    if (value === undefined) return {provided: false, valid: false, reason: ''};

    const valid  = typeof value === 'string' && !/[\r\n]/.test(value) && value.trim().length > 0;
    const reason = valid ? value.trim() : '';

    return {provided: true, valid, reason}
}

/**
 * @summary Appends the durable review-budget override audit record to the submitted review body.
 * @param {String} body Validated review body.
 * @param {Object} audit Review-budget audit payload.
 * @returns {String} Review body with a machine-greppable audit block.
 */
function appendReviewBudgetOverrideAudit(body, audit) {
    return [
        body.trimEnd(),
        '',
        '---',
        REVIEW_BUDGET_OVERRIDE_MARKER,
        `- reason: ${audit.overrideReason}`,
        `- submitted-request-changes: ${audit.submittedRequestChanges}`,
        `- ordinary-limit: ${audit.ordinaryLimit}`,
        `- activated-at: ${audit.activatedAt}`
    ].join('\n')
}

/**
 * @summary Appends durable managed-path provenance to each submitted Request Changes body.
 * @param {String} body Validated review body.
 * @param {Object} audit Review-budget audit payload.
 * @returns {String} Review body with a marker that survives later GitHub dismissal.
 */
function appendReviewBudgetManagedAudit(body, audit) {
    return [
        body.trimEnd(),
        '',
        '---',
        REVIEW_BUDGET_MANAGED_MARKER,
        `- outcome: ${audit.outcome}`,
        `- ordinary-limit: ${audit.ordinaryLimit}`,
        `- activation-issue: ${audit.activationIssueNumber}`,
        `- activation-pr: ${audit.activationPullRequestNumber}`,
        `- activated-at: ${audit.activatedAt}`
    ].join('\n')
}

/**
 * @summary Returns machine-owned review-budget audit fields found in the supplied lines.
 * @param {String[]} lines Review-body lines to inspect.
 * @returns {String[]} Reserved audit-field labels present in the lines.
 */
function getReviewBudgetAuditFields(lines) {
    return REVIEW_BUDGET_AUDIT_FIELDS.filter(label =>
        lines.some(line => line.trim().startsWith(`- ${label}:`))
    )
}

/**
 * @summary Captures the exact machine-owned review-budget suffix and rejects ambiguous duplicates.
 * @param {String} body Review body.
 * @returns {{auditFieldsOutsideTail: String[], managedCount: Number, overrideCount: Number, structureValid: Boolean, tail: String}}
 */
function getReviewBudgetAuditSnapshot(body) {
    const lines         = body.replace(/\r\n/g, '\n').split('\n');
    const markerIndices = marker => lines.reduce((indices, line, index) => {
        if (line.trim() === marker) indices.push(index);

        return indices
    }, []);
    const managedIndices  = markerIndices(REVIEW_BUDGET_MANAGED_MARKER);
    const overrideIndices = markerIndices(REVIEW_BUDGET_OVERRIDE_MARKER);
    const allIndices      = [...managedIndices, ...overrideIndices];
    const markersFramed   = allIndices.every(index => index > 0 && lines[index - 1].trim() === '---');
    const ordered         = overrideIndices.length === 0 ||
        managedIndices.length === 1 && overrideIndices[0] < managedIndices[0];
    const structureValid = managedIndices.length <= 1 && overrideIndices.length <= 1 &&
        (overrideIndices.length === 0 || managedIndices.length === 1) && markersFramed && ordered;
    const firstBlockLine = allIndices.length > 0
        ? Math.min(...allIndices.map(index => Math.max(0, index - 1)))
        : -1;
    const prefixLines            = firstBlockLine >= 0 ? lines.slice(0, firstBlockLine) : lines;
    const auditFieldsOutsideTail = allIndices.length === 0 ? [] : getReviewBudgetAuditFields(prefixLines);

    return {
        auditFieldsOutsideTail,
        managedCount : managedIndices.length,
        overrideCount: overrideIndices.length,
        structureValid,
        tail         : firstBlockLine >= 0 ? lines.slice(firstBlockLine).join('\n').trimEnd() : ''
    }
}

/**
 * @summary Rejects caller-authored review-budget provenance before a review CREATE reaches GitHub.
 * @param {String} body Candidate review body.
 * @returns {Object|null} Structured validation failure or `null` when no reserved provenance exists.
 */
function getReviewBudgetCreateAuditValidationFailure(body) {
    const lines                          = body.replace(/\r\n/g, '\n').split('\n');
    const snapshot                       = getReviewBudgetAuditSnapshot(body);
    const reservedReviewBudgetProvenance = [
        ...(snapshot.managedCount > 0 ? [REVIEW_BUDGET_MANAGED_MARKER] : []),
        ...(snapshot.overrideCount > 0 ? [REVIEW_BUDGET_OVERRIDE_MARKER] : []),
        ...getReviewBudgetAuditFields(lines)
    ];

    if (reservedReviewBudgetProvenance.length === 0) return null;

    return {
        error  : 'PR Review Budget Audit Validation Failed',
        message: 'A review CREATE body cannot supply service-owned review-budget provenance. Remove the reserved marker or audit fields; manage_pr_review appends the canonical receipt when applicable.',
        code   : 'PR_REVIEW_BUDGET_AUDIT_RESERVED',
        reservedReviewBudgetProvenance
    }
}

/**
 * @summary Recognizes a submitted Request Changes review even after GitHub dismisses it.
 * @param {Object} review GitHub pull-request review projection.
 * @returns {Boolean} Whether the review consumed a Request Changes slot.
 */
function isSubmittedRequestChangesReview(review) {
    if (review?.state === 'CHANGES_REQUESTED') return true;
    if (review?.state !== 'DISMISSED') return false;

    const body  = review?.body || '';
    const lines = body.split('\n').map(line => line.trim());

    return body.includes(REVIEW_BUDGET_MANAGED_MARKER) ||
        body.includes(REVIEW_BUDGET_OVERRIDE_MARKER) ||
        REVIEW_BUDGET_BYPASS_PATTERN.test(body) ||
        lines.includes('**Status:** Request Changes') ||
        lines.includes('- **Decision**: Request Changes') ||
        classifyDropSupersedeReview(body).intent
}

/**
 * @summary Resolves the immutable review-budget cutover from an issue's earliest merged base-branch closer.
 *
 * Issue and pull-request numbers share one GitHub namespace, so the policy ticket cannot also
 * be its activation PR. The issue relationship is the stable source anchor; its earliest valid
 * merged closer remains authoritative even if the issue is later reopened.
 *
 * @param {Object} options Resolution inputs.
 * @param {String} options.activationBaseRefName Required activation PR base branch.
 * @param {Object} options.activationIssue GraphQL activation issue projection.
 * @param {Number} options.activationIssueNumber Configured activation issue number.
 * @param {Number} options.pr_number Reviewed PR number for failure envelopes.
 * @returns {{activationPullRequest: Object|null, failure: Object|null}}
 */
function resolveReviewBudgetActivation({
    activationBaseRefName,
    activationIssue,
    activationIssueNumber,
    pr_number
}) {
    const audit      = {activationBaseRefName, activationIssueNumber};
    const references = activationIssue?.closedByPullRequestsReferences;
    const nodes      = references?.nodes;

    if (!activationIssue?.id) {
        return {
            activationPullRequest: null,
            failure              : getReviewBudgetFailure(
                pr_number,
                `Cannot resolve review-budget activation issue #${activationIssueNumber}; refusing REQUEST_CHANGES.`,
                audit
            )
        }
    }

    if (!Array.isArray(nodes) || references?.pageInfo?.hasNextPage !== false ||
        !Number.isInteger(references?.totalCount) || references.totalCount !== nodes.length) {
        return {
            activationPullRequest: null,
            failure              : getReviewBudgetFailure(
                pr_number,
                `Cannot prove the complete closing-PR history for review-budget activation issue #${activationIssueNumber}; refusing REQUEST_CHANGES.`,
                audit
            )
        }
    }

    const malformedMerged = nodes.filter(reference =>
        reference?.state === 'MERGED' && reference?.baseRefName === activationBaseRefName &&
        !Number.isFinite(Date.parse(reference?.mergedAt || ''))
    );

    if (malformedMerged.length > 0) {
        return {
            activationPullRequest: null,
            failure              : getReviewBudgetFailure(
                pr_number,
                `Review-budget activation issue #${activationIssueNumber} has a merged ${activationBaseRefName} closer without a valid mergedAt; refusing REQUEST_CHANGES.`,
                {...audit, malformedActivationPullRequests: malformedMerged.map(reference => reference?.number)}
            )
        }
    }

    const candidates = nodes
        .filter(reference => reference?.state === 'MERGED' && reference?.baseRefName === activationBaseRefName)
        .sort((left, right) => Date.parse(left.mergedAt) - Date.parse(right.mergedAt) || left.number - right.number);

    return {activationPullRequest: candidates[0] || null, failure: null}
}

/**
 * @summary Enforces the deterministic post-cutover Request Changes budget before mutation.
 *
 * Every submitted CHANGES_REQUESTED review counts across heads, authors, and later retractions.
 * A structurally complete terminal Drop+Supersede is allowed once. A named override is a durable,
 * disclosed bypass; it is never inferred from role or prose.
 *
 * @param {Object} options Validation inputs.
 * @param {String} options.activatedAt Versioned cohort cutover.
 * @param {Number} options.activationIssueNumber Source issue for the cohort cutover.
 * @param {Number} options.activationPullRequestNumber Merged closing PR that activated the cohort.
 * @param {String} options.body Validated review body.
 * @param {Number} options.ordinaryLimit Ordinary Request Changes ceiling, PER REVIEWER FAMILY.
 * @param {Number} options.pr_number PR number.
 * @param {Object} options.pullRequest GraphQL PR projection.
 * @param {String} [options.reviewBudgetOverrideReason] Named bypass reason.
 * @param {String|null} options.reviewerLogin Authenticated submitting login; the budget is charged to
 * its family, and an unclassifiable login is refused rather than granted a free round.
 * @returns {{failure: Object|null, body: String, audit: Object|null}}
 */
function validatePrReviewBudget({
    activatedAt,
    activationIssueNumber,
    activationPullRequestNumber,
    body,
    ordinaryLimit,
    pr_number,
    pullRequest,
    reviewBudgetOverrideReason,
    reviewerLogin
}) {
    const activatedMs = Date.parse(activatedAt || '');
    const createdMs   = Date.parse(pullRequest?.createdAt || '');
    const override    = normalizeReviewBudgetOverrideReason(reviewBudgetOverrideReason);
    const baseAudit   = {
        activatedAt,
        activationIssueNumber,
        activationPullRequestNumber,
        createdAt: pullRequest?.createdAt,
        ordinaryLimit
    };

    if (!Number.isFinite(activatedMs) || !Number.isInteger(ordinaryLimit) || ordinaryLimit < 1) {
        return {
            failure: getReviewBudgetFailure(
                pr_number,
                'The managed review budget is misconfigured; refusing REQUEST_CHANGES rather than silently disabling the gate.',
                baseAudit
            ),
            body,
            audit: null
        }
    }

    if (!Number.isFinite(createdMs)) {
        return {
            failure: getReviewBudgetFailure(
                pr_number,
                `Cannot determine the review-budget cohort for PR #${pr_number}; createdAt is missing or invalid.`,
                baseAudit
            ),
            body,
            audit: null
        }
    }

    if (createdMs <= activatedMs) {
        const audit = {...baseAudit, applicable: false, outcome: 'grandfathered'};

        return {
            failure: override.provided
                ? getReviewBudgetFailure(pr_number, 'reviewBudgetOverrideReason is only valid when a post-cutover PR has exhausted its ordinary RC budget.', audit)
                : null,
            body,
            audit
        }
    }

    const reviews = pullRequest?.reviews;

    if (!Array.isArray(reviews?.nodes) || reviews?.pageInfo?.hasPreviousPage !== false) {
        return {
            failure: getReviewBudgetFailure(
                pr_number,
                `Cannot prove the complete submitted-review history for PR #${pr_number}; refusing REQUEST_CHANGES.`,
                {...baseAudit, applicable: true}
            ),
            body,
            audit: null
        }
    }

    const priorRequestChanges = reviews.nodes.filter(isSubmittedRequestChangesReview);
    const priorTerminal       = priorRequestChanges.filter(review => classifyDropSupersedeReview(review?.body || '').valid);
    const incomingTerminal    = classifyDropSupersedeReview(body);

    // WHOSE round is being spent. The budget's unit is the reviewer FAMILY, so the count that matters
    // is this family's prior rounds — not the PR's total. A global count let one family's exhausted
    // budget silence a family that had never reviewed, and let a family buy extra rounds by rotating
    // identities; both are answered by counting the same way the authority defines membership.
    const reviewerFamily = resolveReviewerFamily({author: {login: reviewerLogin}});
    const grouped        = groupReviewsByFamily(priorRequestChanges);
    const familyPrior    = reviewerFamily.classified ? (grouped.byFamily[reviewerFamily.family] || 0) : 0;

    const audit = {
        ...baseAudit,
        applicable                   : true,
        submittedRequestChanges      : priorRequestChanges.length,
        priorTerminalDropSupersede   : priorTerminal.length,
        reviewerFamily               : reviewerFamily.family,
        reviewerLogin                : reviewerFamily.login,
        familySubmittedRequestChanges: familyPrior,
        unclassifiedPriorReviewers   : grouped.unclassified.map(entry => entry.login)
    };

    // Fail CLOSED on a reviewer the identity graph cannot classify. The alternative reads as
    // generosity and is the opposite: an unrostered login would spend nobody's budget, so it could
    // request changes without limit while every rostered family stayed bounded. A gate that cannot
    // name the spender must refuse the charge, not waive it.
    if (!reviewerFamily.classified) {
        return {
            failure: getReviewBudgetFailure(
                pr_number,
                `The submitting reviewer (${reviewerFamily.login || 'no resolvable login'}) is not a classifiable maintainer family, so this REQUEST_CHANGES cannot be charged to a review budget. Refusing rather than granting an unbounded round.`,
                audit
            ),
            body,
            audit: null
        }
    }

    if (override.provided && !override.valid) {
        return {
            failure: getReviewBudgetFailure(pr_number, 'reviewBudgetOverrideReason must be a non-empty single line.', audit),
            body,
            audit  : null
        }
    }

    if (priorTerminal.length > 0) {
        return {
            failure: getReviewBudgetFailure(
                pr_number,
                `PR #${pr_number} already has a validated terminal Drop+Supersede review; another REQUEST_CHANGES review would reopen a terminal lane.`,
                audit
            ),
            body,
            audit: null
        }
    }

    if (incomingTerminal.valid) {
        const terminalAudit = {...audit, outcome: 'terminal-drop-supersede'};

        return {
            failure: override.provided
                ? getReviewBudgetFailure(pr_number, 'A first validated terminal Drop+Supersede is already the budget exception; an override is unnecessary.', audit)
                : null,
            body : appendReviewBudgetManagedAudit(body, terminalAudit),
            audit: terminalAudit
        }
    }

    if (familyPrior < ordinaryLimit) {
        const withinBudgetAudit = {...audit, outcome: 'within-budget'};

        return {
            failure: override.provided
                ? getReviewBudgetFailure(pr_number, 'reviewBudgetOverrideReason is only valid after the ordinary RC budget is exhausted.', audit)
                : null,
            body : appendReviewBudgetManagedAudit(body, withinBudgetAudit),
            audit: withinBudgetAudit
        }
    }

    if (override.valid) {
        // ONE re-entry, and it is terminal. A family that has already spent its repair-minted round has
        // spent the exception too — otherwise the exception becomes the budget, reachable indefinitely
        // by writing a well-formed receipt each time. Prior re-entries are countable because the
        // override audit is appended durably to the review body it authorized.
        const priorReEntries = priorRequestChanges.filter(review =>
            (review?.body || '').includes(REVIEW_BUDGET_OVERRIDE_MARKER) &&
            resolveReviewerFamily(review).family === reviewerFamily.family
        );

        if (priorReEntries.length > 0) {
            return {
                failure: getReviewBudgetFailure(
                    pr_number,
                    `The ${reviewerFamily.family} family has already used its one repair-minted re-entry on PR #${pr_number}. A second is refused: post the terminal disposition, APPROVE when merge-safe, or one validated Drop+Supersede.`,
                    {...audit, priorRepairMintedReEntries: priorReEntries.length}
                ),
                body,
                audit: null
            }
        }

        // Only THIS family's prior review heads. The exception is granted to a family on the strength
        // of what that family reviewed, so corroboration drawn from another family's history would
        // let a reviewer borrow a causal claim they never made.
        const currentFamilyPriorHeads = priorRequestChanges
            .filter(review => resolveReviewerFamily(review).family === reviewerFamily.family)
            .map(review => review?.commit?.oid)
            .filter(Boolean);

        const receipt = parseRepairMintedReceipt(
            override.reason,
            currentFamilyPriorHeads,
            pullRequest?.headRefOid || ''
        );

        if (!receipt.valid) {
            return {
                failure: getReviewBudgetFailure(
                    pr_number,
                    receipt.failure || `A repair-minted re-entry must name old-head, new-head, prior-fact, and repair-coordinate; missing: ${receipt.missing.join(', ')}. An ordinary later discovery does not qualify — the defect must not have existed, or not have been discoverable, at the head Round 1 reviewed.`,
                    {...audit, repairMintedReceipt: receipt.fields}
                ),
                body,
                audit: null
            }
        }

        const overrideAudit = {
            ...audit,
            outcome            : 'disclosed-override',
            overrideReason     : override.reason,
            repairMintedReceipt: receipt.fields
        };

        return {
            failure: null,
            body   : appendReviewBudgetManagedAudit(
                appendReviewBudgetOverrideAudit(body, overrideAudit),
                overrideAudit
            ),
            audit  : overrideAudit
        }
    }

    return {
        failure: getReviewBudgetFailure(
            pr_number,
            `The ${reviewerFamily.family} family has already spent its ${familyPrior}-of-${ordinaryLimit} ordinary CHANGES_REQUESTED round on PR #${pr_number}. Post the terminal disposition over the existing actions, APPROVED when merge-safe, or one validated Drop+Supersede. Another family's independent round is unaffected by this refusal.`,
            audit
        ),
        body,
        audit: null
    }
}

function normalizeCheckoutOptions(options) {
    if (typeof options === 'number') {
        return {pr_number: options};
    }

    return options || {};
}

/**
 * @summary Builds the guarded `checkout_pull_request` executor.
 *
 * The MCP transport does not carry the caller's current working directory, so the
 * checkout path must be explicit. The returned executor refuses caller-unknown
 * mutations, verifies the supplied path is the git top-level, performs checkout
 * there, and reads back git state for reviewer-side V-B-A.
 *
 * @param {Object}   [options]
 * @param {Function} [options.execFileFn] Injectable command runner for unit tests.
 * @param {String}   [options.projectRoot] Server process repo root used only for refusal diagnostics.
 * @param {Object}   [options.log] Logger with an `error()` method.
 * @returns {Function} Guarded checkout function.
 */
function buildCheckoutPullRequest({
    execFileFn = execFileAsync,
    projectRoot = aiConfig.projectRoot,
    log = logger
} = {}) {
    return async function checkoutPullRequest(options) {
        const {pr_number, repoPath} = normalizeCheckoutOptions(options);
        const prNumber              = Number(pr_number);

        if (!Number.isInteger(prNumber) || prNumber <= 0) {
            return {
                error  : 'Bad Request',
                message: "Missing or invalid required argument: 'pr_number' must be a positive integer.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        const serverRepoPath = path.resolve(projectRoot);

        if (!repoPath) {
            return {
                error  : 'Unsafe checkout refused',
                message: [
                    '`checkout_pull_request` cannot infer the caller workspace over shared MCP transport. ',
                    'Pass `repoPath` equal to the caller workspace git root, or run `gh pr checkout` manually in that workspace.'
                ].join(''),
                code    : 'CALLER_WORKSPACE_REQUIRED',
                repoPath: serverRepoPath
            };
        }

        const normalizedRepoPath = path.resolve(repoPath);
        let gitTopLevel;

        try {
            const {stdout} = await execFileFn('git', ['rev-parse', '--show-toplevel'], {cwd: normalizedRepoPath});
            gitTopLevel = path.resolve(stdout.trim());
        } catch (error) {
            log.error(`Error resolving git top-level for checkout_pull_request repoPath '${normalizedRepoPath}':`, error);
            return {
                error   : 'Invalid repoPath',
                message : `repoPath '${normalizedRepoPath}' is not a readable git worktree root.`,
                code    : 'INVALID_REPO_PATH',
                repoPath: normalizedRepoPath,
                details : error.stderr || error.message
            };
        }

        if (gitTopLevel !== normalizedRepoPath) {
            return {
                error  : 'Unsafe checkout refused',
                message: [
                    `repoPath '${normalizedRepoPath}' resolves to git top-level '${gitTopLevel}'. `,
                    'Pass the git top-level explicitly so the checkout target is unambiguous.'
                ].join(''),
                code    : 'REPO_PATH_NOT_GIT_ROOT',
                repoPath: normalizedRepoPath,
                gitTopLevel
            };
        }

        try {
            const {stdout}      = await execFileFn('gh', ['pr', 'checkout', String(prNumber)], {cwd: gitTopLevel});
            const branchResult  = await execFileFn('git', ['branch', '--show-current'], {cwd: gitTopLevel});
            const headShaResult = await execFileFn('git', ['rev-parse', 'HEAD'], {cwd: gitTopLevel});
            const branch        = branchResult.stdout.trim();
            const headSha       = headShaResult.stdout.trim();

            return {
                message : `Successfully checked out PR #${prNumber}`,
                details : stdout.trim(),
                repoPath: gitTopLevel,
                branch,
                headSha
            };
        } catch (error) {
            log.error(`Error checking out PR #${prNumber}:`, error);
            return {
                error   : 'GitHub CLI command failed',
                message : `gh pr checkout ${prNumber} failed with exit code ${error.code}`,
                code    : 'GH_CLI_ERROR',
                repoPath: gitTopLevel,
                details : error.stderr || error.message
            };
        }
    };
}

/**
 * @summary Service for interacting with GitHub Pull Requests via the `gh` CLI and GraphQL API.
 *
 * This service acts as a unified interface for Pull Request operations.
 * It combines the `gh` CLI (for operations like `checkout` and `diff`) with
 * the GraphQL API (for metadata retrieval, listing, and conversation history)
 * to provide a comprehensive toolset for managing PRs.
 *
 * @class Neo.ai.services.github-workflow.PullRequestService
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.PullRequestService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.PullRequestService',
        /**
         * Issue whose earliest merged closing PR activates deterministic review-budget enforcement.
         * The relationship-derived merge receipt prevents the gate from retroactively freezing PRs
         * opened while the activation lane itself was still under review.
         * @member {Number} reviewBudgetActivationIssueNumber=15257
         */
        reviewBudgetActivationIssueNumber: 15257,
        /**
         * Base branch eligible to supply the activation issue's closing merge receipt.
         * @member {String} reviewBudgetActivationBaseRefName='dev'
         */
        reviewBudgetActivationBaseRefName: 'dev',
        /**
         * Maximum ordinary submitted CHANGES_REQUESTED reviews PER REVIEWER FAMILY on a post-cutover PR.
         *
         * One, not two, and per family rather than per PR. The prior global ceiling of two measured the
         * wrong thing in both directions: one family's two rounds silenced a family that had never
         * reviewed, while a single family could spend both rounds itself and call it a budget. Counting
         * by family makes each family's one comprehensive round independent, which is the shape the
         * terminal-review decision actually describes.
         * @member {Number} reviewBudgetOrdinaryRcLimit=1
         */
        reviewBudgetOrdinaryRcLimit: 1,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Checks out a pull request into an explicitly supplied caller workspace.
     *
     * @param {Object|Number} options Object form `{pr_number, repoPath}` or legacy
     *                                positional PR number. Legacy numeric form now
     *                                refuses until a caller workspace is explicit.
     * @returns {Promise<object>} Structured checkout state or an explicit refusal/error.
     */
    async checkoutPullRequest(options) {
        return buildCheckoutPullRequest()(options);
    }

    /**
     * Gets the conversation for a specific pull request, optionally filtered by comment
     * selector to reduce context-fetch cost across review cycles.
     *
     * **Default behavior (no selectors):** returns full conversation — backward compatible
     * with the default full-conversation shape that existing callers depend on.
     *
     * **Selectors (first-match precedence, pick at most one):**
     * - `comment_id` — fetch ONLY the matching comment. Accepts a node ID, numeric database id,
     *   an `issuecomment-N` anchor, or a full comment URL; an unrecognised shape errors. Used for A2A
     *   hand-off: a reviewer posts a comment, mailboxes the `commentId` from the create-path
     *   return shape to the peer, peer fetches just-this-comment for near-zero context cost.
     * - `since_comment_id` — fetch all comments AFTER the one with the given ID (exclusive).
     *   Used for incremental review cycles: agent tracks the last seen commentId and fetches
     *   only what's new. Scales linearly with new-comment volume, not cumulative thread size.
     * - `last_n` — fetch the last N comments. Coarse-grained alternative when comment IDs
     *   aren't tracked. Useful for quick catch-up scans.
     * - `projection: 'merge-readiness'` — returns a source-owned, identity-bound exact-head
     *   readiness observation instead of conversation content. The MCP router injects the
     *   identity assertion; callers cannot supply readiness fields.
     *
     * Selectors are applied client-side after a single GraphQL fetch (the fetch itself already
     * caps at `aiConfig.pullRequest.maxCommentsPerPullRequest`). Server-side pagination
     * optimization is a follow-up concern if empirical volume demands it; for current
     * conversation sizes (up to a few dozen comments) client-side filter is simpler and
     * avoids multi-query cursor choreography.
     *
     * @param {Object|number} options Either a number (backward-compatible `prNumber` positional form)
     *                                or an object with the shape below.
     * @param {number}        options.pr_number         The pull request number (required when object form).
     * @param {string}        [options.projection='conversation'] Response projection.
     * @param {string}        [options.comment_id]      Return only the matching comment; others elided.
     *                                                  Accepts a node ID (current `IC_…` or legacy base64),
     *                                                  the numeric database id, an `issuecomment-N` anchor,
     *                                                  or a full comment URL. An unrecognised shape returns
     *                                                  `MALFORMED_COMMENT_ID`; a well-formed id absent from
     *                                                  the thread returns empty comments. SCOPED: the PR
     *                                                  body is omitted and `bodyOmitted: true` is set.
     * @param {string}        [options.since_comment_id] Return comments strictly after the matching comment
     *                                                  (by createdAt order). Same accepted spellings, and the
     *                                                  same malformed-vs-absent split — the older "callers can
     *                                                  interpret as nothing-new OR id-invalid" ambiguity is
     *                                                  resolved one level up, because invalid now errors.
     * @param {number}        [options.last_n]          Return only the last N comments (by createdAt order).
     *                                                  Also scoped: body omitted, `bodyOmitted: true`.
     * @param {Object}        [dependencies] Internal source seams for deterministic tests.
     * @param {Function}      [dependencies.query] GitHub GraphQL query function.
     * @param {Function}      [dependencies.rest] GitHub REST request function.
     * @param {Function}      [dependencies.now] Observation-clock function.
     * @returns {Promise<object>} Conversation data or a structured error. A SCOPED request (any selector)
     *          omits the parent body and sets `bodyOmitted: true`; an unscoped request is unchanged.
     *          Payloads are trust-projected: authored nodes carry `authorTrust`, untrusted-author bodies
     *          arrive defanged, and the root carries a `contentTrust` summary (see
     *          `shared/conversationTrust.mjs`).
     */
    async getConversation(options, dependencies = {}) {
        // Accept positional `prNumber` form for backward compatibility.
        // New callers use the object form for filter support.
        const {
            pr_number,
            comment_id,
            since_comment_id,
            last_n,
            projection = 'conversation',
            identityAssertion
        } = typeof options === 'number'
            ? {pr_number: options}
            : (options || {});

        if (!pr_number) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'pr_number' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        if (!['conversation', MERGE_READINESS_PROJECTION].includes(projection)) {
            return {
                error  : 'Bad Request',
                message: `Unsupported projection '${projection}'.`,
                code   : 'INVALID_PROJECTION'
            };
        }

        if (projection === MERGE_READINESS_PROJECTION) {
            if (comment_id || since_comment_id || last_n) {
                return {
                    error  : 'Bad Request',
                    message: 'Comment selectors cannot be combined with the merge-readiness projection.',
                    code   : 'INCOMPATIBLE_SELECTORS'
                };
            }

            return buildMergeReadinessProjection({
                prNumber: pr_number,
                identityAssertion,
                ...dependencies
            });
        }

        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            prNumber   : pr_number,
            maxComments: aiConfig.pullRequest.maxCommentsPerPullRequest
        };

        try {
            const query = dependencies.query || GraphqlService.query.bind(GraphqlService);
            const data  = await query(GET_CONVERSATION, variables);
            // Trust-project at the read boundary: every authored node gains `authorTrust`,
            // untrusted-author bodies are defanged, the root carries a `contentTrust` summary.
            // Applied before selector filtering so all return paths inherit projected nodes.
            const pullRequest = projectConversationTrust(data.repository.pullRequest);
            const allComments = pullRequest.comments?.nodes || [];

            // Selector precedence: comment_id > since_comment_id > last_n > full.
            let filtered;

            if (isSelectorPresent(comment_id)) {
                // Malformed → error, never an empty list. The two spellings a peer actually holds —
                // a URL anchor and a bare number — used to filter every comment away silently.
                const selector = parseCommentId(comment_id);

                if (!selector) {
                    return malformedCommentIdError('comment_id', comment_id);
                }

                filtered = allComments.filter(comment => commentMatches(comment, selector));
            } else if (isSelectorPresent(since_comment_id)) {
                const selector = parseCommentId(since_comment_id);

                if (!selector) {
                    return malformedCommentIdError('since_comment_id', since_comment_id);
                }

                const anchorIdx = allComments.findIndex(comment => commentMatches(comment, selector));
                // Well-formed but absent → empty result set. The ambiguity the old comment described
                // ("nothing after" vs "invalid id") is now resolved one level up: invalid errors, so
                // reaching here means the id was a real shape that this thread does not carry.
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                // No selector — return full conversation shape unchanged (backward compat).
                return pullRequest;
            }

            // Scoped paths narrow the comments AND drop the parent body: asking for one comment out
            // of a long thread previously cost the whole head. Unscoped calls above are unchanged.
            return omitScopedBody({
                ...pullRequest,
                comments: {
                    ...pullRequest.comments,
                    nodes: filtered
                }
            });
        } catch (error) {
            logger.error(`Error getting conversation for PR #${pr_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Gets the diff for a specific pull request.
     * @param {Object} options Parameters object
     * @param {number}  options.pr_number  The number of the pull request
     * @param {string}  [options.file]     Optional file path (or comma-separated paths) to filter diff
     * @param {string}  [options.sha]      Optional SHA to diff against instead of live PR head
     * @param {boolean} [options.files_only] If true, return structured JSON with path/additions/deletions
     * @returns {Promise<string|object>} A promise that resolves to the diff text, file list JSON, or a structured error.
     */
    async getPullRequestDiff(options) {
        const { pr_number, file, sha, files_only } = options || {};

        const prNumber = parseInt(pr_number, 10);

        if (isNaN(prNumber)) {
            return {
                error  : 'Bad Request',
                message: "Missing or invalid required argument: 'pr_number'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        try {
            if (files_only) {
                const {stdout} = await execFileAsync('gh', ['pr', 'view', String(prNumber), '--json', 'files'], {cwd: aiConfig.projectRoot});
                const parsed   = JSON.parse(stdout);
                return { files: parsed.files || [] };
            }

            let diffStdout = '';

            if (sha) {
                if (!file) {
                    return {
                        error  : 'Bad Request',
                        message: "The 'sha' parameter requires the 'file' parameter to be provided.",
                        code   : 'INVALID_ARGUMENTS'
                    };
                }

                if (!/^[0-9a-f]{4,40}$/i.test(sha)) {
                    return {
                        error  : 'Bad Request',
                        message: "The 'sha' parameter must be a valid git object hash (4-40 hex characters).",
                        code   : 'INVALID_ARGUMENTS'
                    };
                }

                const {stdout: baseStdout} = await execFileAsync('gh', ['pr', 'view', String(prNumber), '--json', 'baseRefOid'], {cwd: aiConfig.projectRoot});
                const baseRefOid           = JSON.parse(baseStdout).baseRefOid;

                const filePaths = file.split(',').map(f => f.trim());
                const {stdout}  = await execFileAsync('git', ['diff', `${baseRefOid}...${sha}`, '--', ...filePaths], {cwd: aiConfig.projectRoot});
                diffStdout = stdout;
            } else {
                const {stdout} = await execFileAsync('gh', ['pr', 'diff', String(prNumber)], {cwd: aiConfig.projectRoot});
                diffStdout = stdout;
            }

            if (file) {
                if (sha) {
                    return { result: diffStdout };
                }

                const fileList    = file.split(',').map(f => f.trim());
                const lines       = diffStdout.split('\n');
                const resultLines = [];
                let   capturing   = false;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('diff --git ')) {
                        const parts = line.split(' b/');
                        if (parts.length >= 2) {
                            const aPath = parts[0].replace('diff --git a/', '');
                            const bPath = parts.slice(1).join(' b/');
                            if (fileList.includes(bPath) || fileList.includes(aPath)) {
                                capturing = true;
                                resultLines.push(line);
                                continue;
                            }
                        }
                        capturing = false;
                    } else if (capturing) {
                        resultLines.push(line);
                    }
                }

                return { result: resultLines.join('\n') };
            }

            return { result: diffStdout };

        } catch (error) {
            logger.error(`Error getting diff for PR #${prNumber}:`, error);

            if (error.stderr && (error.stderr.includes('bad object') || error.stderr.includes('unknown revision') || error.stderr.includes('Invalid symmetric difference expression'))) {
                return {
                    error  : 'SHA not found',
                    message: `The provided SHA could not be found in the repository: ${error.message}`,
                    code   : 'SHA_NOT_FOUND',
                    details: error.stderr
                };
            }

            return {
                error  : 'GitHub CLI command failed',
                message: `Failed to retrieve diff for PR #${prNumber}: ${error.message}`,
                code   : 'GH_CLI_ERROR',
                details: error.stderr || error.message
            };
        }
    }

    /**
     * Fetches a list of pull requests from GitHub.
     * @param {object}   [options]                                           The options for listing pull requests
     * @param {number}   [options.limit=aiConfig.pullRequest.defaults.limit] The maximum number of PRs to return
     * @param {string}   [options.state=aiConfig.pullRequest.defaults.state] The state of the pull requests to list (open, closed, merged, all)
     * @param {Number[]} [options.believedOpen]                              Exact PR numbers whose open belief should be falsified
     * @returns {Promise<object>} A promise that resolves to the list of pull requests or a structured error.
     */
    async listPullRequests({
        believedOpen,
        limit = aiConfig.pullRequest.defaults.limit,
        state = aiConfig.pullRequest.defaults.state
    } = {}) {

        const validationMessage = getBelievedOpenValidationMessage(believedOpen);

        if (validationMessage) {
            return {
                error  : 'Invalid believedOpen input',
                message: validationMessage,
                code   : 'INVALID_BELIEVED_OPEN'
            }
        }

        const variables = {
            owner : aiConfig.owner,
            repo  : aiConfig.repo,
            limit,
            states: state.toUpperCase()
        };

        try {
            const beliefPlan = believedOpen === undefined
                ? null
                : buildPullRequestsWithBeliefQuery(believedOpen);
            const response = beliefPlan
                ? await GraphqlService.query(beliefPlan.query, variables, {strict: false})
                : await GraphqlService.query(FETCH_PULL_REQUESTS, variables);
            const data = beliefPlan && response && Object.hasOwn(response, 'data')
                ? response.data
                : response;
            const pullRequests = data.repository.pullRequests.nodes.map(normalizePullRequestListItem);

            const result = {
                count: pullRequests.length,
                pullRequests
            };

            if (beliefPlan) {
                result.checkedAt = new Date().toISOString();
                result.belief    = projectBelievedOpen(data.repository, beliefPlan.lookups);
            }

            return result;
        } catch (error) {
            logger.error('Error fetching pull requests via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Dry-run validates a PR review body against the canonical review templates.
     *
     * This is the pre-post lint companion for {@link #managePrReview}: it performs the same
     * mechanical body-shape validation without resolving a PR id or sending a GitHub review
     * mutation. The read-only path may return exact template-skeleton misses so composers can
     * repair the body before the formal `manage_pr_review` call; the mutation path keeps its
     * anti-stuffing response narrower.
     *
     * @param {Object} options
     * @param {String} options.body Candidate PR review body.
     * @returns {Object} `{valid: true}` on success, or the structured validation failure with
     *                   `valid: false` and exact read-only diagnostics where safe.
     */
    validatePrReviewBody({body} = {}) {
        if (!body) {
            return {
                valid  : false,
                error  : 'Bad Request',
                message: "Missing required argument: 'body' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const templateValidationFailure = getPrReviewTemplateValidationFailure(body, {
            includeTemplateDiagnostics: true
        });

        if (templateValidationFailure) {
            return {
                valid: false,
                ...templateValidationFailure
            };
        }

        // The selected asset, not a constant. This returned `PR_REVIEW_TEMPLATE_PATH` unconditionally,
        // so a Round-2 or micro-delta body was told it matched the canonical template — sending an
        // author who then hit a rejection to the wrong file to find out why. A validator that
        // misreports which contract it applied is worse than one that reports nothing.
        return {
            valid   : true,
            message : 'Review body matches the pr-review template structure.',
            skill   : '.agents/skills/pr-review/SKILL.md',
            template: selectedPrReviewTemplatePath(body)
        };
    }

    /**
     * @summary Atomic create or update of a formal GitHub pull request review.
     *
     * Closes the empirically-recurring formal-state gap pattern: agents post substantive review prose via `manage_issue_comment`
     * but forget the second `gh pr review --approve | --request-changes` step to flip
     * GitHub's `reviewDecision` surface, blocking the cross-family review mandate gate
     * per `pull-request §6.1`. This tool routes through the `addPullRequestReview`
     * GraphQL mutation — single call posts the review body AND transitions formal state
     * atomically.
     *
     * **Action: 'create'** — requires `pr_number`, `state`, `body`. Resolves PR node ID,
     * submits review with the given event.
     *
     * **Action: 'update'** — requires `review_id`, `body`. Updates the review's body
     * only; GitHub does not allow changing a submitted review's state via this mutation
     * (dismiss + resubmit is the path, deliberately out of v1 scope).
     *
     * **state → event mapping** (caller surface uses the friendlier `state` enum;
     * the GraphQL mutation requires `PullRequestReviewEvent`):
     *   - `APPROVED`        → `APPROVE`
     *   - `REQUEST_CHANGES` → `REQUEST_CHANGES`
     *   - `COMMENT`         → `COMMENT`
     *
     * @param {Object} options
     * @param {String} options.action           Either `'create'` or `'update'`.
     * @param {Number} [options.pr_number]      The pull request number (required for `create`).
     * @param {String} [options.state]          Review state (required for `create`): `APPROVED` | `REQUEST_CHANGES` | `COMMENT`.
     * @param {String} options.body             The review body.
     * @param {String} [options.review_id]      The GraphQL node ID of the existing review (required for `update`; PRR_*).
     * @param {Object} [options.acknowledgedRequestChanges] Reviewer-login → disposition map required when approving over live `CHANGES_REQUESTED`.
     * @param {String} [options.reviewBudgetOverrideReason] Single-line durable disclosure for an exceptional post-budget ordinary RC.
     * @returns {Promise<Object>} Review payload on success (`{message, reviewId, state, url, submittedAt, databaseId?}`) or structured error.
     *
     * @see Neo.ai.services.github-workflow.queries.mutations.ADD_PULL_REQUEST_REVIEW
     */
    async managePrReview({
        acknowledgedRequestChanges,
        action,
        pr_number,
        state,
        body,
        review_id,
        reviewBudgetOverrideReason
    }) {
        if (!['create', 'update'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'create' or 'update'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        if (!body) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'body' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const templateValidationFailure = getPrReviewTemplateValidationFailure(body);

        if (templateValidationFailure) {
            return templateValidationFailure;
        }

        if (action === 'create') {
            if (typeof pr_number !== 'number') {
                return {
                    error  : 'Bad Request',
                    message: "Missing required argument for 'create': 'pr_number' (number).",
                    code   : 'MISSING_ARGUMENTS'
                };
            }

            const stateToEvent = {
                APPROVED       : 'APPROVE',
                REQUEST_CHANGES: 'REQUEST_CHANGES',
                COMMENT        : 'COMMENT'
            };

            const event = stateToEvent[state];

            if (!event) {
                return {
                    error  : 'Bad Request',
                    message: `Invalid state '${state}'. Must be one of: ${Object.keys(stateToEvent).join(', ')}.`,
                    code   : 'INVALID_ARGUMENTS'
                };
            }

            const reviewBudgetAuditValidationFailure = getReviewBudgetCreateAuditValidationFailure(body);

            if (reviewBudgetAuditValidationFailure) {
                return reviewBudgetAuditValidationFailure
            }

            if (MICRO_DELTA_COMMENTED_CLOSURE_PATTERN.test(body) && event !== 'COMMENT') {
                return {
                    error  : 'PR Review Closure State Validation Failed',
                    message: 'COMMENTED CLOSURE must be submitted with state COMMENT so the RC2 packet cannot create another ordinary Request Changes review.',
                    code   : 'PR_REVIEW_CLOSURE_STATE_VALIDATION_FAILED'
                }
            }

            const dropSupersede = classifyDropSupersedeReview(body);

            if (dropSupersede.intent && event !== 'REQUEST_CHANGES') {
                return {
                    error  : 'Drop+Supersede State Validation Failed',
                    message: 'A terminal Drop+Supersede verdict must use state REQUEST_CHANGES; COMMENT and APPROVED cannot carry the one terminal RC exception.',
                    code   : 'DROP_SUPERSEDE_STATE_VALIDATION_FAILED'
                }
            }

            try {
                const idData = await GraphqlService.query(GET_PULL_REQUEST_ID, {
                    activationIssueNumber: this.reviewBudgetActivationIssueNumber,
                    owner                : aiConfig.owner,
                    repo                 : aiConfig.repo,
                    prNumber             : pr_number
                });
                const activationIssue = idData?.repository?.activationIssue;
                const pullRequest     = idData?.repository?.pullRequest;
                const pullRequestId   = pullRequest?.id;

                if (!pullRequestId) {
                    return {
                        error  : 'Not Found',
                        message: `Pull request #${pr_number} not found or returned no id.`,
                        code   : 'PR_NOT_FOUND'
                    };
                }


                let reviewBudgetAudit;
                let submissionBody = body;

                if (event === 'APPROVE') {
                    const followUpOwnershipFailure = getApproveFollowUpOwnershipFailure({
                        body,
                        // Read from the PR body in the SAME projection already fetched above, so
                        // "not this PR's own close target" costs no extra round trip.
                        closeTargets: collectPrCloseTargets(pullRequest?.body),
                        subject     : `PR #${pr_number}`
                    });

                    if (followUpOwnershipFailure) {
                        return followUpOwnershipFailure
                    }

                    // Only reached when the approval CARRIES follow-up items — a plain APPROVE never
                    // gets here, so the default terminal outcome performs no extra request at all.
                    const ownerNumbers = collectFollowUpOwnerNumbers(body);

                    if (ownerNumbers.length > 0) {
                        let states = null;

                        try {
                            const resolved = await GraphqlService.query(buildIssueStatesQuery(ownerNumbers), {
                                owner: aiConfig.owner,
                                repo : aiConfig.repo
                            });

                            states = Object.fromEntries(ownerNumbers.map(number =>
                                [number, resolved?.repository?.[`issue${number}`]?.state ?? null]));
                        } catch (error) {
                            // Unreadable answer ⇒ no refusal. See the helper's note: this gate sits on
                            // the merge-safe terminal, so a GitHub hiccup must not block the path the
                            // contract exists to make reachable.
                            logger.warn(`Follow-up owner resolution failed for PR #${pr_number}; admitting: ${error.message}`)
                        }

                        const ownerResolutionFailure = states && getFollowUpOwnerResolutionFailure({
                            numbers: ownerNumbers,
                            states,
                            subject: `PR #${pr_number}`
                        });

                        if (ownerResolutionFailure) {
                            return ownerResolutionFailure
                        }
                    }

                    const stateValidationFailure = getPrReviewStateValidationFailure({
                        acknowledgedRequestChanges,
                        pr_number,
                        pullRequest
                    });

                    if (stateValidationFailure) {
                        return stateValidationFailure
                    }
                } else if (event === 'COMMENT') {
                    // Stateless by construction. The earlier version resolved activation and the
                    // family's spent rounds here, which meant a family that never chose the
                    // REQUEST_CHANGES enum was never "post-budget" and could demand indefinitely.
                    const actionPacketFailure = getCommentActionPacketFailure({body, subject: `PR #${pr_number}`});

                    if (actionPacketFailure) {
                        return actionPacketFailure
                    }
                } else if (event === 'REQUEST_CHANGES') {
                    const activationResolution = resolveReviewBudgetActivation({
                        activationBaseRefName: this.reviewBudgetActivationBaseRefName,
                        activationIssue,
                        activationIssueNumber: this.reviewBudgetActivationIssueNumber,
                        pr_number
                    });

                    if (activationResolution.failure) return activationResolution.failure;

                    const activationPullRequest = activationResolution.activationPullRequest;

                    if (!activationPullRequest) {
                        if (reviewBudgetOverrideReason !== undefined) {
                            return getReviewBudgetFailure(
                                pr_number,
                                'reviewBudgetOverrideReason is unavailable before the activation issue has a merged closing PR.',
                                {activationIssueNumber: this.reviewBudgetActivationIssueNumber, applicable: false}
                            )
                        }

                        reviewBudgetAudit = {
                            activatedAt                : null,
                            activationIssueNumber      : this.reviewBudgetActivationIssueNumber,
                            activationPullRequestNumber: null,
                            applicable                 : false,
                            outcome                    : 'pre-activation'
                        }
                    } else {
                        const budgetValidation = validatePrReviewBudget({
                            activatedAt                : activationPullRequest.mergedAt,
                            activationIssueNumber      : this.reviewBudgetActivationIssueNumber,
                            activationPullRequestNumber: activationPullRequest.number,
                            body,
                            ordinaryLimit              : this.reviewBudgetOrdinaryRcLimit,
                            pr_number,
                            pullRequest,
                            reviewBudgetOverrideReason,
                            // The STARTUP-CACHED login, deliberately not the awaiting getter. Admission
                            // is a hot path and must not acquire an identity over the network while
                            // deciding whether to admit: a validator that makes its own round trip can
                            // fail for reasons that have nothing to do with the review it is judging.
                            // A cold cache resolves to null, which the budget already treats as
                            // unclassifiable and refuses — the safe direction.
                            reviewerLogin              : RepositoryService.viewerLogin
                        });

                        if (budgetValidation.failure) {
                            return budgetValidation.failure
                        }

                        reviewBudgetAudit = budgetValidation.audit;
                        submissionBody    = budgetValidation.body
                    }
                }

                // Runs for EVERY state, and after the budget path — the only placement satisfying both
                // constraints. Ahead of budget validation, a template complaint masked the budget's
                // fail-closed refusals. Inside the REQUEST_CHANGES branch, where the fix for that first
                // put it, it became unreachable for every state a valid Round 2 can use — the state
                // matrix forbids REQUEST_CHANGES for a disposition, so the guard existed only in the
                // one state its own rule excludes. @neo-gpt caught that one round after catching the
                // defect it was fixing.
                if (isRound2PrReview(body)) {
                    const relationFailure = getRound2DispositionRelationFailure({
                        body,
                        reviews: pullRequest?.reviews?.nodes,
                        state
                    });

                    if (relationFailure) {
                        return relationFailure;
                    }
                }

                const reviewData = await GraphqlService.query(ADD_PULL_REQUEST_REVIEW, {
                    pullRequestId,
                    body: submissionBody,
                    event
                });

                const review = reviewData?.addPullRequestReview?.pullRequestReview;

                if (!review) {
                    return {
                        error  : 'GraphQL API request failed',
                        message: 'addPullRequestReview returned no pullRequestReview node.',
                        code   : 'GRAPHQL_API_ERROR'
                    };
                }

                return {
                    message    : `Successfully created ${review.state} review on PR #${pr_number}`,
                    reviewId   : review.id,
                    state      : review.state,
                    url        : review.url,
                    submittedAt: review.submittedAt,
                    databaseId : review.databaseId,
                    ...(reviewBudgetAudit ? {reviewBudget: reviewBudgetAudit} : {})
                };
            } catch (error) {
                logger.error(`Error creating PR review on PR #${pr_number}:`, error);
                return {
                    error  : 'GraphQL API request failed',
                    message: error.message,
                    code   : 'GRAPHQL_API_ERROR'
                };
            }
        }

        // action === 'update'
        if (!review_id) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument for 'update': 'review_id' (the GraphQL node ID of the existing review).",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            const currentData   = await GraphqlService.query(GET_PULL_REQUEST_REVIEW, {reviewId: review_id});
            const currentReview = currentData?.node;

            if (!currentReview?.id) {
                return {
                    error  : 'Not Found',
                    message: `Pull request review ${review_id} not found or returned no review node.`,
                    code   : 'PR_REVIEW_NOT_FOUND'
                }
            }

            const currentBody   = currentReview.body || '';
            const currentAudit  = getReviewBudgetAuditSnapshot(currentBody);
            const incomingAudit = getReviewBudgetAuditSnapshot(body);
            const markerChanges = [];

            if (currentAudit.managedCount !== incomingAudit.managedCount ||
                currentAudit.managedCount > 1 || incomingAudit.managedCount > 1) {
                markerChanges.push(REVIEW_BUDGET_MANAGED_MARKER)
            }

            if (currentAudit.overrideCount !== incomingAudit.overrideCount ||
                currentAudit.overrideCount > 1 || incomingAudit.overrideCount > 1) {
                markerChanges.push(REVIEW_BUDGET_OVERRIDE_MARKER)
            }

            if (!currentAudit.structureValid || !incomingAudit.structureValid) {
                markerChanges.push('machine-owned-tail-structure')
            }

            const currentTerminal   = classifyDropSupersedeReview(currentBody).intent;
            const incomingTerminal  = classifyDropSupersedeReview(body).intent;
            const auditFieldChanges = [
                ...(currentAudit.tail === incomingAudit.tail ? [] : ['machine-owned-tail']),
                ...currentAudit.auditFieldsOutsideTail.map(label => `current-outside-tail:${label}`),
                ...incomingAudit.auditFieldsOutsideTail.map(label => `incoming-outside-tail:${label}`)
            ];

            if (markerChanges.length > 0 || currentTerminal !== incomingTerminal || auditFieldChanges.length > 0) {
                return {
                    error                        : 'PR Review Budget Audit Validation Failed',
                    message                      : 'A submitted review update cannot change review-budget provenance, audit fields, or ordinary-versus-Drop+Supersede classification.',
                    code                         : 'PR_REVIEW_BUDGET_AUDIT_IMMUTABLE',
                    markerChanges,
                    auditFieldChanges,
                    terminalClassificationChanged: currentTerminal !== incomingTerminal
                }
            }

            // The same two demand guards the create path runs. Editing a submitted review is a second
            // way to raise a packet, and until this ran here the create-side guards could be walked
            // around entirely: post an admissible COMMENT or APPROVE, then edit the demand in.
            // @neo-gpt drove both injections at the exact head and both reached the mutation.
            //
            // This is where being stateless pays: the update path holds the review's own state and
            // body but no PR projection, so a budget-scoped rule could not be applied here at all
            // without a second fetch. A body-and-state rule applies identically on both paths.
            //
            // `CHANGES_REQUESTED` is deliberately absent: a demand packet is what that state is FOR,
            // and its ordinary round was charged when the review was created.
            let updateDemandFailure = null;

            if (currentReview.state === 'APPROVED') {
                // Close targets need the PR body, which this path does not fetch. An approval edit is
                // therefore held to the coordinate-and-form half of the rule; the create path, which
                // has the projection, is where the close-target arm is enforced.
                updateDemandFailure = getApproveFollowUpOwnershipFailure({body, subject: `review ${review_id}`})
            } else if (currentReview.state === 'COMMENTED') {
                updateDemandFailure = getCommentActionPacketFailure({body, subject: `review ${review_id}`})
            }

            if (updateDemandFailure) {
                return updateDemandFailure
            }

            const updateData = await GraphqlService.query(UPDATE_PULL_REQUEST_REVIEW, {
                pullRequestReviewId: review_id,
                body
            });

            const review = updateData?.updatePullRequestReview?.pullRequestReview;

            if (!review) {
                return {
                    error  : 'GraphQL API request failed',
                    message: 'updatePullRequestReview returned no pullRequestReview node.',
                    code   : 'GRAPHQL_API_ERROR'
                };
            }

            return {
                message    : `Successfully updated review ${review.id}`,
                reviewId   : review.id,
                state      : review.state,
                url        : review.url,
                submittedAt: review.submittedAt
            };
        } catch (error) {
            logger.error(`Error updating PR review ${review_id}:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Unified add/remove of GitHub PR reviewer-requests via the REST `requested_reviewers` endpoint.
     *
     * Verifies the **effect**: the endpoint's own success body carries the resulting `requested_reviewers` /
     * `requested_teams`, and the verdict is read from there. Measured against the live API, GitHub accepts
     * a login that does not exist, answers 200, and seats nobody — so neither the exit code nor the absence
     * of an exception proves a reviewer was assigned. Mirrors `IssueService.assignIssue`'s `verifiedAssignees`
     * post-verify.
     *
     * Sibling to `IssueService.manageIssueAssignees` for PR reviewer invitations — closes the
     * **invitation layer** of the cross-family review mandate (`pull-request §6.1`). The mandate
     * itself is the validation layer (Approved-status before merge); this tool is the active
     * invitation primitive that pairs with it. Without invitation, reviewers learn about PRs
     * needing review via passive notification polling — the latency this tool closes.
     *
     * Calls GitHub's `requested_reviewers` REST endpoint directly (`POST` to add / `DELETE` to remove,
     * on `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`) — it needs only the `repo`
     * scope. The prior `gh pr edit --add/remove-reviewer` path resolved logins via GraphQL, which
     * requires `read:org` (a scope agent tokens routinely lack), so it failed for every agent on that
     * credential class. Permission errors still surface via the `gh` exit code.
     *
     * @param {object}    options
     * @param {number}    options.pr_number          The number of the pull request.
     * @param {string[]}  [options.reviewers]        Array of GitHub user logins to add or remove as reviewers.
     * @param {string[]}  [options.team_reviewers]   Array of bare team slugs (no owner prefix — the REST endpoint takes slugs directly).
     * @param {string}    options.action             Either `'add'` or `'remove'`.
     * @returns {Promise<object>} On success, a message plus `verifiedReviewers` / `verifiedTeamReviewers`
     * read out of GitHub's response — never echoed from the arguments. A requested login that GitHub did
     * not seat returns `REVIEWER_NOT_SEATED`, a `remove` whose target is still listed returns
     * `REVIEWER_STILL_REQUESTED` (both naming the targets under `unseated`), and a response that cannot be
     * verified returns `REVIEWER_STATE_UNVERIFIABLE`. All three are failures, not partial successes.
     *
     * @see pull-request-workflow.md §6.1 (cross-family mandate — invitation layer cross-reference)
     */
    async managePrReviewers({pr_number, reviewers, team_reviewers, action}, {execFn = execAsync} = {}) {
        if (!['add', 'remove'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'add' or 'remove'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        // Logins/slugs may arrive with a leading `@`; the REST body wants bare values.
        const reviewerList     = (reviewers || []).map(r => r.replace(/^@/, ''));
        const teamReviewerList = (team_reviewers || []).map(t => t.replace(/^@/, ''));

        if (reviewerList.length === 0 && teamReviewerList.length === 0) {
            return {
                error  : 'Bad Request',
                message: "At least one entry in 'reviewers' or 'team_reviewers' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            // Use the REST `requested_reviewers` endpoint rather than `gh pr edit --add/remove-reviewer`:
            // the CLI resolves logins via GraphQL, which requires the `read:org` scope that agent tokens
            // routinely lack (they carry `repo`/`project`/`user`/etc. but not `read:org`), so the CLI path
            // fails for every agent on that credential class. REST needs only `repo`. Request body:
            // `reviewers[]` (user logins) + `team_reviewers[]` (bare team slugs — REST takes the slug, not
            // the `owner/slug` form `gh pr edit` requires).
            const method        = action === 'add' ? 'POST' : 'DELETE';
            const reviewerFlags = reviewerList.map(r => `-f 'reviewers[]=${r}'`).join(' ');
            const teamFlags     = teamReviewerList.map(t => `-f 'team_reviewers[]=${t}'`).join(' ');
            const allFlags      = [reviewerFlags, teamFlags].filter(Boolean).join(' ');
            const allTargets    = [...reviewerList, ...teamReviewerList];

            const command = `gh api repos/${aiConfig.owner}/${aiConfig.repo}/pulls/${pr_number}/requested_reviewers -X ${method} ${allFlags}`;
            logger.info(`Attempting to ${action} reviewers on PR #${pr_number} via REST: ${allTargets.join(', ')}`);

            const {stdout} = await execFn(command, {cwd: aiConfig.projectRoot}) || {};

            // Report the EFFECT, not the request. Measured directly against the live API: an unknown login
            // is accepted and silently dropped, and that call answered 200 with the full PR object having
            // seated nobody — so `gh` exits 0 and there is no error for the catch below to see. (200 there
            // is the observed unknown-login receipt, not the endpoint's general contract; GitHub documents
            // add as 201 and remove as 200. The verdict does not read the status either way.) Echoing
            // `reviewerList` back as success told callers a reviewer was assigned when none was, and the PR
            // then sat unreviewed with no failure signal anywhere. The success body already carries the
            // resulting state, so the verdict comes from what GitHub returned — never from what we asked for.
            const seated = parseSeatedReviewerState(stdout);

            if (!seated) {
                logger.error(`Unverifiable requested_reviewers response on PR #${pr_number}`);
                return {
                    error  : 'Reviewer state unverifiable',
                    message: `Cannot confirm reviewer state on PR #${pr_number}: the requested_reviewers response did not carry the expected 'requested_reviewers'/'requested_teams' arrays, so whether ${allTargets.join(', ')} ${action === 'add' ? 'was seated' : 'was removed'} is unknown. Re-read the PR before trusting any reviewer assumption.`,
                    code   : 'REVIEWER_STATE_UNVERIFIABLE',
                    pr_number
                };
            }

            // `add` demands presence, `remove` demands absence — the same read-back, inverted.
            const wanted        = action === 'add';
            const unseatedUsers = reviewerList    .filter(login => seated.users.has(login.toLowerCase()) !== wanted);
            const unseatedTeams = teamReviewerList.filter(slug  => seated.teams.has(slug .toLowerCase()) !== wanted);
            const unseated      = [...unseatedUsers, ...unseatedTeams];

            if (unseated.length > 0) {
                // The two actions fail into OPPOSITE observed states, so they cannot share one envelope.
                // A failed `remove` means the target is STILL a requested reviewer — telling that caller
                // "reviewer not seated" and pointing them at the roster describes the inverse of what
                // GitHub just returned, and sends them to look for a nonexistent login when the login
                // demonstrably exists and holds the seat. Each action names its own postcondition.
                const failure = wanted
                    ? {
                        error  : 'Reviewer not seated',
                        code   : 'REVIEWER_NOT_SEATED',
                        message: `${unseated.join(', ')} were not seated as reviewers on PR #${pr_number}. ` +
                            `GitHub returned a successful mutation response, but the returned reviewer state ` +
                            `does not include them — the usual cause is a login that does not exist or is not ` +
                            `a collaborator. Verify the login against the roster in ai/graph/identityRoots.mjs.`
                    }
                    : {
                        error  : 'Reviewer still requested',
                        code   : 'REVIEWER_STILL_REQUESTED',
                        message: `${unseated.join(', ')} remain requested reviewers on PR #${pr_number}: the ` +
                            `removal was not applied. GitHub returned a successful mutation response, but the ` +
                            `returned reviewer state still lists them, so the seat is NOT free. Re-read the ` +
                            `PR's reviewer state before assigning it to anyone else.`
                    };

                logger.error(`${failure.code} on PR #${pr_number}: ${unseated.join(', ')}`);

                return {
                    ...failure,
                    pr_number,
                    // Targets whose requested change was not applied: absent after `add`, present after
                    // `remove`. The name reads add-shaped; the meaning is action-relative, and `code` is
                    // the field that says which direction failed.
                    unseated,
                    // Same meaning as on the success path: who GitHub reports as seated right now.
                    verifiedReviewers    : [...seated.users],
                    verifiedTeamReviewers: [...seated.teams]
                };
            }

            const verb = action === 'add' ? 'requested' : 'removed';
            return {
                message              : `Successfully ${verb} reviewers on PR #${pr_number}: ${allTargets.join(', ')} (verified against the returned reviewer state)`,
                pr_number,
                // Derived from GitHub's response, not from the caller's arguments — that is the whole point.
                verifiedReviewers    : [...seated.users],
                verifiedTeamReviewers: [...seated.teams]
            };
        } catch (error) {
            logger.error(`Error managing reviewers on PR #${pr_number}:`, error);
            return {
                error  : 'GitHub API request failed',
                message: `Failed to ${action} reviewers on PR #${pr_number}: ${error.message} (REST requested_reviewers needs only the repo scope)`,
                code   : 'GH_API_ERROR',
                details: error.stderr || error.message
            };
        }
    }
}

const PullRequestServiceSingleton = Neo.setupClass(PullRequestService);

// Named for the spec: the relation is a pure function of (body, prior reviews, state), so it is
// worth driving directly rather than only through a stubbed GraphQL round-trip.
export {buildCheckoutPullRequest, getRound2DispositionRelationFailure};
export default PullRequestServiceSingleton;
