import fs   from 'node:fs';
import path from 'node:path';

import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';
import {
    getAgentLogin,
    normalizeAgentIdentity,
    resolveLifecycleStateFile
} from '../../scripts/lifecycle/lifecycleState.mjs';

/**
 * @module Neo.ai.services.graph.lifecycleStateWriter
 * @summary Builds and writes the Stop-hook lifecycle-state board.
 *
 * Golden Path synthesis owns the source data. This helper owns the compact hook
 * projection and atomic write through the shared lifecycle-state resolver. It
 * degrades by omitting unverifiable fields; it never fabricates mailbox or PR
 * state when a source is unavailable.
 */

/**
 * @summary Derives the compact hook-board state for an open PR.
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
        .filter(pr => typeof pr.number === 'number' || typeof pr.number === 'string')
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, limit)
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
 * @summary Counts unread inbox messages for the selected agent identity.
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

    const normalized = normalizeAgentIdentity(agentIdentity);
    if (!normalized) return undefined;

    const readCount = async () => {
        const result = await mailboxService.countMessages({box: 'inbox', status: 'unread'});
        const count  = Number(result?.count);

        return Number.isInteger(count) && count >= 0 ? count : undefined
    };

    try {
        const activeIdentity = requestContextService?.getAgentIdentityNodeId?.();
        if (activeIdentity === normalized) {
            return await readCount()
        }

        if (typeof requestContextService?.run !== 'function') return undefined;

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
    const generatedDate      = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
    const normalizedIdentity = normalizeAgentIdentity(agentIdentity);
    const state              = {
        agentIdentity: normalizedIdentity,
        generatedAt  : Number.isFinite(generatedDate.getTime())
            ? generatedDate.toISOString()
            : new Date().toISOString()
    };

    if (Array.isArray(prs)) {
        state.openPRs = buildOpenPrBoard(prs, {agentIdentity: normalizedIdentity});
    }

    if (Array.isArray(routedTopNodes)) {
        state.goldenPathDirection = buildGoldenPathDirection(routedTopNodes);
    }

    const unreadCount = await resolveUnreadCount({
        agentIdentity: normalizedIdentity,
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
 * @param {String} [options.agentIdentity] AgentIdentity or login used when resolving `filePath`.
 * @param {Object} [options.env=process.env] Environment map for resolver override.
 * @param {String} [options.filePath] Explicit target JSON path.
 * @param {Object} [options.fsImpl=fs] fs-compatible implementation for tests.
 * @param {String} [options.homeDir] OS home override for tests.
 * @param {String} [options.rootDir] Resolver root override for tests.
 * @param {Object} options.state Lifecycle-state payload.
 * @returns {String} Written target path.
 */
export function writeLifecycleStateFile({
    agentIdentity,
    env     = process.env,
    filePath,
    fsImpl  = fs,
    homeDir,
    rootDir,
    state
} = {}) {
    if (!state || typeof state !== 'object') {
        throw new Error('Cannot write lifecycle-state: state object required');
    }

    const targetPath = filePath || resolveLifecycleStateFile({
        agentIdentity: agentIdentity || state.agentIdentity,
        env,
        homeDir,
        rootDir
    });

    if (!targetPath) {
        throw new Error('Cannot write lifecycle-state: agent identity required');
    }

    const dir     = path.dirname(targetPath);
    const tmpPath = path.join(dir, `.lifecycle-state.${process.pid}.${Date.now()}.tmp`);

    fsImpl.mkdirSync(dir, {recursive: true});
    fsImpl.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    try {
        fsImpl.renameSync(tmpPath, targetPath);
    } catch (e) {
        try { fsImpl.unlinkSync(tmpPath); } catch {}
        throw e;
    }

    return targetPath
}
