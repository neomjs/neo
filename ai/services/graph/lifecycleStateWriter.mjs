import fs                     from 'fs';
import path                   from 'path';
import {fileURLToPath}        from 'url';
import RequestContextService  from '../../mcp/server/shared/services/RequestContextService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_LIFECYCLE_STATE_FILE = path.resolve(__dirname, '../../../.claude/logs/lifecycle-state.json');

/**
 * @module ai/services/graph/lifecycleStateWriter
 * @summary Shared writer for the stop-hook lifecycle-state board.
 *
 * Owner contract: produce the single fail-open JSON file read by
 * `.claude/hooks/laneStateStopHook.mjs`, using data already resolved by the Golden Path
 * synthesis pass plus the bound-agent mailbox counter. The hook remains read-only; this
 * helper owns the temp+rename write and degrades by omitting unverifiable fields rather
 * than fabricating state.
 */

/**
 * @summary Normalizes AgentIdentity or GitHub-login strings to `@identity` form.
 * @param {String|null|undefined} value Identity candidate.
 * @returns {String|null}
 */
export function normalizeAgentIdentity(value) {
    const str = String(value || '').trim();

    if (!str) return null;

    return str.startsWith('@') ? str : `@${str}`
}

/**
 * @summary Converts an AgentIdentity or GitHub login to the bare GitHub login form.
 * @param {String|null|undefined} value Identity candidate.
 * @returns {String|null}
 */
export function getAgentLogin(value) {
    const normalized = normalizeAgentIdentity(value);

    return normalized ? normalized.slice(1) : null
}

/**
 * @summary Derives the compact hook-board state for an open PR.
 *
 * The hook renders only `#number state`, so this keeps the state intentionally coarse:
 * active review changes beat outstanding review requests, then approval, then plain open.
 *
 * @param {Object} pr GitHub PR payload.
 * @returns {String}
 */
export function getOpenPrBoardState(pr) {
    const reviews = Array.isArray(pr?.reviews) ? pr.reviews : [];

    if (reviews.some(review => review?.state === 'CHANGES_REQUESTED')) return 'CHANGES_REQUESTED';
    if (Array.isArray(pr?.reviewRequests) && pr.reviewRequests.length > 0) return 'REVIEW_REQUESTED';
    if (reviews.some(review => review?.state === 'APPROVED')) return 'APPROVED';

    return 'OPEN'
}

/**
 * @summary Projects current-agent open PR payloads into the hook's bounded board shape.
 * @param {Object[]} prs GitHub PR payloads from `fetchOpenPRs`.
 * @param {Object} [options]
 * @param {String} [options.agentIdentity=process.env.NEO_AGENT_IDENTITY] Active AgentIdentity.
 * @param {Number} [options.limit=10] Maximum board rows.
 * @returns {Object[]}
 */
export function buildOpenPrBoard(prs = [], {
    agentIdentity = process.env.NEO_AGENT_IDENTITY,
    limit = 10
} = {}) {
    if (!Array.isArray(prs)) return [];

    const agentLogin = getAgentLogin(agentIdentity);
    if (!agentLogin) return [];

    return prs
        .filter(pr => pr?.author?.login === agentLogin)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, limit)
        .filter(pr => typeof pr.number === 'number' || typeof pr.number === 'string')
        .map(pr => ({
            number: pr.number,
            state : getOpenPrBoardState(pr)
        }))
}

/**
 * @summary Projects routed Computed Golden Path nodes into the hook's advisory direction field.
 * @param {Object[]} routedTopNodes Golden Path routed node entries.
 * @param {Object} [options]
 * @param {Number} [options.limit=5] Maximum direction rows.
 * @returns {Object[]}
 */
export function buildGoldenPathDirection(routedTopNodes = [], {
    limit = 5
} = {}) {
    if (!Array.isArray(routedTopNodes)) return [];

    return routedTopNodes
        .filter(item => item?.node?.id)
        .slice(0, limit)
        .map(item => {
            const title = item.node.properties?.title || item.node.properties?.name || item.node.name;
            const row   = {id: String(item.node.id)};

            if (Number.isFinite(Number(item.score))) {
                row.score = Number(item.score);
            }
            if (typeof title === 'string' && title.trim()) {
                row.title = title.trim();
            }

            return row
        })
}

/**
 * @summary Counts unread inbox messages for the active agent, binding env identity when needed.
 * @param {Object} options
 * @param {Object} options.mailboxService MailboxService-compatible object.
 * @param {Object} [options.requestContextService=RequestContextService] Context service.
 * @param {String} [options.agentIdentity=process.env.NEO_AGENT_IDENTITY] Active AgentIdentity.
 * @returns {Promise<Number|undefined>} Verified unread count, or `undefined` when unavailable.
 */
export async function resolveUnreadCount({
    mailboxService,
    requestContextService = RequestContextService,
    agentIdentity = process.env.NEO_AGENT_IDENTITY
} = {}) {
    if (typeof mailboxService?.countMessages !== 'function') return undefined;

    const readCount = async () => {
        const result = await mailboxService.countMessages({box: 'inbox', status: 'unread'});
        const count  = Number(result?.count);

        return Number.isInteger(count) && count >= 0 ? count : undefined
    };

    let activeIdentity = null;

    try {
        activeIdentity = requestContextService?.getAgentIdentityNodeId?.();
    } catch {
        activeIdentity = null;
    }

    try {
        if (activeIdentity) {
            return await readCount()
        }

        const normalized = normalizeAgentIdentity(agentIdentity);
        if (!normalized || typeof requestContextService?.run !== 'function') return undefined;

        const userId = normalized.slice(1);

        return await requestContextService.run({
            agentIdentityNodeId: normalized,
            source             : 'env-var',
            userId,
            username           : userId
        }, readCount)
    } catch {
        return undefined
    }
}

/**
 * @summary Builds the lifecycle-state JSON payload from verified source data.
 * @param {Object} options
 * @param {Date|String} [options.generatedAt=new Date()] Capture time.
 * @param {Object[]} [options.prs] Open PR payloads; omitted from output when unavailable.
 * @param {Object[]} [options.routedTopNodes] Routed Golden Path entries; omitted when unavailable.
 * @param {Object} [options.mailboxService] MailboxService-compatible object.
 * @param {String} [options.agentIdentity=process.env.NEO_AGENT_IDENTITY] Active AgentIdentity.
 * @param {Object} [options.requestContextService=RequestContextService] Context service.
 * @returns {Promise<Object>} Lifecycle-state payload.
 */
export async function buildLifecycleState({
    generatedAt = new Date(),
    prs,
    routedTopNodes,
    mailboxService,
    agentIdentity = process.env.NEO_AGENT_IDENTITY,
    requestContextService = RequestContextService
} = {}) {
    const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    const state         = {
        generatedAt: Number.isFinite(generatedDate.getTime())
            ? generatedDate.toISOString()
            : new Date().toISOString()
    };

    if (Array.isArray(prs)) {
        state.openPRs = buildOpenPrBoard(prs, {agentIdentity});
    }

    if (Array.isArray(routedTopNodes)) {
        state.goldenPathDirection = buildGoldenPathDirection(routedTopNodes);
    }

    const unreadCount = await resolveUnreadCount({
        agentIdentity,
        mailboxService,
        requestContextService
    });
    if (Number.isInteger(unreadCount) && unreadCount >= 0) {
        state.unreadCount = unreadCount;
    }

    return state
}

/**
 * @summary Atomically writes the lifecycle-state payload for hook consumption.
 * @param {Object} options
 * @param {String} [options.filePath=DEFAULT_LIFECYCLE_STATE_FILE] Target JSON path.
 * @param {Object} options.state Lifecycle-state payload.
 * @param {Object} [options.fsImpl=fs] fs-compatible implementation for tests.
 * @returns {String} Written target path.
 */
export function writeLifecycleStateFile({
    filePath = DEFAULT_LIFECYCLE_STATE_FILE,
    state,
    fsImpl = fs
} = {}) {
    if (!state || typeof state !== 'object') {
        throw new Error('Cannot write lifecycle-state: state object required');
    }

    const dir     = path.dirname(filePath);
    const tmpPath = path.join(dir, `.lifecycle-state.${process.pid}.${Date.now()}.tmp`);

    fsImpl.mkdirSync(dir, {recursive: true});
    fsImpl.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fsImpl.renameSync(tmpPath, filePath);

    return filePath
}
