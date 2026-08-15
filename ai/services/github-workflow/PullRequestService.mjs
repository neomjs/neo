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
import {projectConversationTrust}              from './shared/conversationTrust.mjs';

const execAsync                        = promisify(exec);
const execFileAsync                    = promisify(execFile);
const PR_REVIEW_TEMPLATE_PATH          = '.agents/skills/pr-review/assets/pr-review-template.md';
const PR_REVIEW_FOLLOWUP_TEMPLATE_PATH = '.agents/skills/pr-review/assets/pr-review-followup-template.md';
const ACKNOWLEDGED_RC_ADDRESSED_PREFIX = 'addressed-by-';
const ACKNOWLEDGED_RC_EVIDENCE_PREFIX  = 'superior-evidence:';
const REVIEW_BUDGET_MANAGED_MARKER     = '[review-budget-managed]';
const REVIEW_BUDGET_OVERRIDE_MARKER    = '[review-budget-override]';
const REVIEW_BUDGET_BYPASS_PATTERN     = /^\[review-budget-bypass\]\s+reason:\s*\S.*$/im;
const REVIEW_BUDGET_AUDIT_FIELDS       = [
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

    const predicate = validateMergeReady({
        state           : snapshot.state,
        mergedAt        : snapshot.mergedAt,
        reviewDecision  : snapshot.reviewDecision,
        checksGreen,
        mergeStateStatus: snapshot.mergeStateStatus,
        reviewRequests
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
                ? `Observed strict merge-ready at ${observedAt} for ${owner}/${repo}#${prNumber} head ${snapshot.headRefOid}.`
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

const FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_LABELS = [
    'PR Review Follow-Up Summary',
    'Patch-Blind Premise Snapshot',
    'Strategic-Fit Decision',
    'Prior Review Anchor',
    'Delta Scope',
    'Previous Required Actions Audit',
    'Delta Depth Floor',
    'Metrics Delta',
    'Required Actions'
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
    'PR Review Follow-Up Summary'    : '# PR Review Follow-Up Summary',
    'Patch-Blind Premise Snapshot'   : '### 🧭 Patch-Blind Premise Snapshot',
    'Strategic-Fit Decision'         : '### 🪜 Strategic-Fit Decision',
    'Prior Review Anchor'            : '### ⚓ Prior Review Anchor',
    'Delta Scope'                    : '### 🔁 Delta Scope',
    'Previous Required Actions Audit': '### ✅ Previous Required Actions Audit',
    'Delta Depth Floor'              : '### 🔬 Delta Depth Floor',
    'Metrics Delta'                  : '### 📊 Metrics Delta',
    'Required Actions'               : '### 📋 Required Actions'
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

const FOLLOWUP_PR_REVIEW_SHAPE_HINTS = [
    '# PR Review Follow-Up Summary',
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
    return [
        ...getTemplateHeadingAnchorsByLabel(PR_REVIEW_FOLLOWUP_TEMPLATE_PATH, FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_LABELS, {
            fallbackByLabel: FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_FALLBACK_BY_LABEL
        }),
        '**Cycle:**'
    ];
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

function getReviewBudgetFailure(pr_number, message, audit = {}) {
    return {
        error              : 'PR Review Budget Validation Failed',
        message,
        code               : 'PR_REVIEW_BUDGET_VALIDATION_FAILED',
        permittedNextStates: ['APPROVED', 'COMMENT', 'validated Drop+Supersede'],
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
    if (priorHeads.length && !priorHeads.includes(fields['old-head'])) {
        return {
            valid  : false,
            missing,
            fields,
            failure: `old-head ${fields['old-head']} matches no head a prior review was submitted against (${priorHeads.join(', ') || 'none recorded'}).`
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

        const receipt = parseRepairMintedReceipt(
            override.reason,
            priorRequestChanges.map(review => review?.commit?.oid).filter(Boolean),
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
     * - `comment_id` — fetch ONLY the comment whose GitHub node ID matches. Used for A2A
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
     * @param {string}        [options.comment_id]      Return only the matching comment's data; other
     *                                                  comments elided. PR title/body still returned.
     * @param {string}        [options.since_comment_id] Return comments strictly after the matching
     *                                                  comment (by createdAt order). If the id isn't found,
     *                                                  returns empty comments (callers can interpret as
     *                                                  "nothing new" or "id invalid").
     * @param {number}        [options.last_n]          Return only the last N comments (by createdAt order).
     * @param {Object}        [dependencies] Internal source seams for deterministic tests.
     * @param {Function}      [dependencies.query] GitHub GraphQL query function.
     * @param {Function}      [dependencies.rest] GitHub REST request function.
     * @param {Function}      [dependencies.now] Observation-clock function.
     * @returns {Promise<object>} Conversation data (optionally filtered) or a structured error. Payloads
     *          are trust-projected: authored nodes carry `authorTrust`, untrusted-author bodies arrive
     *          defanged, and the root carries a `contentTrust` summary (see `shared/conversationTrust.mjs`).
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

            if (comment_id) {
                filtered = allComments.filter(c => c.id === comment_id);
            } else if (since_comment_id) {
                const anchorIdx = allComments.findIndex(c => c.id === since_comment_id);
                // Anchor not found → empty result set (callers interpret as "nothing after" or
                // "invalid id"). Trying to infer intent would hide bugs.
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                // No selector — return full conversation shape unchanged (backward compat).
                return pullRequest;
            }

            // Filtered paths preserve PR title/body/author; only comments are narrowed.
            // Caller can detect filtering via comments.length vs unfiltered fetch.
            return {
                ...pullRequest,
                comments: {
                    ...pullRequest.comments,
                    nodes: filtered
                }
            };
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

        return {
            valid   : true,
            message : 'Review body matches the pr-review template structure.',
            skill   : '.agents/skills/pr-review/SKILL.md',
            template: PR_REVIEW_TEMPLATE_PATH
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
                    const stateValidationFailure = getPrReviewStateValidationFailure({
                        acknowledgedRequestChanges,
                        pr_number,
                        pullRequest
                    });

                    if (stateValidationFailure) {
                        return stateValidationFailure
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

export {buildCheckoutPullRequest};
export default PullRequestServiceSingleton;
