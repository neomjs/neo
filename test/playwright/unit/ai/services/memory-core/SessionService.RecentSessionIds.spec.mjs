import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreRecentSessionIdsTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import SessionService        from '../../../../../../ai/services/memory-core/SessionService.mjs';
import StorageRouter         from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import aiConfig              from '../../../../../../ai/mcp/server/memory-core/config.mjs';

/**
 * @summary Creates a minimal Chroma collection spy for metadata-only read tests.
 * @returns {Object} In-memory collection compatible with `collection.get()`.
 */
function createSpyCollection() {
    const rows = new Map();

    return {
        rows,

        async get({ids, limit, offset, where} = {}) {
            let entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            if (where?.userId) {
                entries = entries.filter(entry => entry.metadata.userId === where.userId);
            }

            if (limit !== undefined || offset !== undefined) {
                const start = offset ?? 0;
                entries = entries.slice(start, start + (limit ?? entries.length));
            }

            return {
                ids      : entries.map(entry => entry.id),
                metadatas: entries.map(entry => entry.metadata),
                documents: entries.map(entry => entry.document || '')
            };
        }
    };
}

function seedMemory(collection, id, {sessionId, timestamp, agentIdentity='@neo-gpt', userId}) {
    collection.rows.set(id, {
        id,
        metadata: {
            sessionId,
            timestamp,
            agentIdentity,
            ...(userId ? {userId} : {})
        }
    });
}

function seedSummary(collection, id, {sessionId, timestamp, title, sourceAgentIdentities='@neo-gpt', userId}) {
    collection.rows.set(id, {
        id,
        metadata: {
            sessionId,
            timestamp,
            title,
            sourceAgentIdentities,
            ...(userId ? {userId} : {})
        }
    });
}

test.describe('SessionService.getRecentSessionIds (#10194)', () => {
    let memoryCollection, summaryCollection;
    let originalGetMemoryCollection, originalGetSummaryCollection;
    let originalValidateSessionForResume, originalGetSummarizationStatusBySessionIds;
    let originalMemorySharingPolicy;

    test.beforeEach(() => {
        memoryCollection = createSpyCollection();
        summaryCollection = createSpyCollection();

        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        originalGetSummaryCollection = StorageRouter.getSummaryCollection;
        originalValidateSessionForResume = SessionService.validateSessionForResume;
        originalGetSummarizationStatusBySessionIds = SessionService.constructor.getSummarizationStatusBySessionIds;
        originalMemorySharingPolicy = aiConfig.memorySharing.defaultPolicy;

        StorageRouter.getMemoryCollection = async () => memoryCollection;
        StorageRouter.getSummaryCollection = async () => summaryCollection;
        SessionService.constructor.getSummarizationStatusBySessionIds = () => new Map();
        SessionService.validateSessionForResume = async ({sessionId}) => ({
            success: true,
            sessionId,
            status: 'resumable',
            memoryCount: 1,
            lastActivityAt: new Date(1).toISOString(),
            summarizationStatus: 'none'
        });
        aiConfig.memorySharing.defaultPolicy = 'team';
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        StorageRouter.getSummaryCollection = originalGetSummaryCollection;
        SessionService.validateSessionForResume = originalValidateSessionForResume;
        SessionService.constructor.getSummarizationStatusBySessionIds = originalGetSummarizationStatusBySessionIds;
        aiConfig.memorySharing.defaultPolicy = originalMemorySharingPolicy;
    });

    test('discovers raw sessions newest-first and augments title from summaries when available', async () => {
        const validationCalls = [];

        SessionService.validateSessionForResume = async ({sessionId}) => {
            validationCalls.push(sessionId);
            return {
                success: true,
                sessionId,
                status: 'resumable',
                memoryCount: 1,
                lastActivityAt: new Date(1).toISOString(),
                summarizationStatus: 'none'
            };
        };

        seedMemory(memoryCollection, 'm-a1', {sessionId: 'session-a', timestamp: 100, agentIdentity: '@neo-gpt'});
        seedMemory(memoryCollection, 'm-b1', {sessionId: 'session-b', timestamp: 300, agentIdentity: '@neo-opus-ada'});
        seedMemory(memoryCollection, 'm-a2', {sessionId: 'session-a', timestamp: 500, agentIdentity: '@neo-gpt'});
        seedMemory(memoryCollection, 'm-c1', {sessionId: 'session-c', timestamp: 400, agentIdentity: '@neo-gpt'});
        seedSummary(summaryCollection, 's-a', {sessionId: 'session-a', timestamp: 450, title: 'Session A Summary'});

        const result = await SessionService.getRecentSessionIds({limit: 2});

        expect(result._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(result.total).toBe(3);
        expect(result.count).toBe(2);
        expect(result.sessions.map(session => session.sessionId)).toEqual(['session-a', 'session-c']);
        expect(result.sessions[0]).toMatchObject({
            sessionId   : 'session-a',
            memoryCount : 2,
            resumeStatus: 'resumable',
            title       : 'Session A Summary'
        });
        expect(result.sessions[1].title).toBeNull();
        expect(validationCalls).toEqual(['session-a', 'session-c']);
    });

    test('uses the summary author-scope semantics for @me and explicit identities', async () => {
        seedMemory(memoryCollection, 'm-g1', {sessionId: 'gpt-session',  timestamp: 300, agentIdentity: '@neo-gpt'});
        seedMemory(memoryCollection, 'm-a1', {sessionId: 'ada-session',  timestamp: 200, agentIdentity: '@neo-opus-ada'});
        seedMemory(memoryCollection, 'm-g2', {sessionId: 'gpt-session',  timestamp: 400, agentIdentity: '@neo-gpt'});

        const own = await RequestContextService.run({agentIdentityNodeId: '@neo-gpt'}, () =>
            SessionService.getRecentSessionIds({agentIdentity: '@me'})
        );

        expect(own.total).toBe(1);
        expect(own.sessions[0].sessionId).toBe('gpt-session');

        const explicit = await SessionService.getRecentSessionIds({agentIdentity: 'neo-opus-ada'});

        expect(explicit.total).toBe(1);
        expect(explicit.sessions[0].sessionId).toBe('ada-session');

        await expect(SessionService.getRecentSessionIds({agentIdentity: '@me'}))
            .rejects.toThrow(/requires a bound caller identity/);
    });

    test('hides finalized sessions by default and surfaces them when requested', async () => {
        seedMemory(memoryCollection, 'm-final', {sessionId: 'finalized-session', timestamp: 500});
        seedMemory(memoryCollection, 'm-busy',  {sessionId: 'busy-session',      timestamp: 400});

        SessionService.constructor.getSummarizationStatusBySessionIds = () => new Map([
            ['finalized-session', {status: 'completed'}],
            ['busy-session',      {status: 'in_progress', expires_at: Date.now() + 60_000}]
        ]);

        SessionService.validateSessionForResume = async ({sessionId}) => {
            if (sessionId === 'finalized-session') {
                return {
                    code: 'SESSION_FINALIZED',
                    sessionId,
                    summarizationStatus: 'completed'
                };
            }

            return {
                code: 'SESSION_BUSY',
                sessionId,
                summarizationStatus: 'in_progress'
            };
        };

        const hidden = await SessionService.getRecentSessionIds();

        expect(hidden.total).toBe(1);
        expect(hidden.sessions[0]).toMatchObject({
            sessionId          : 'busy-session',
            resumeStatus       : 'SESSION_BUSY',
            summarizationStatus: 'in_progress'
        });

        const included = await SessionService.getRecentSessionIds({includeFinalized: true});

        expect(included.total).toBe(2);
        expect(included.sessions.map(session => session.sessionId)).toEqual(['finalized-session', 'busy-session']);
        expect(included.sessions[0]).toMatchObject({
            resumeStatus       : 'SESSION_FINALIZED',
            summarizationStatus: 'completed'
        });
    });
});
