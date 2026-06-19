import {setup} from '../../../../setup.mjs';

const appName = 'TurnPresenceServiceTest';

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
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

// Stub Neo.get to keep data-record boot behavior from masking turn-presence coverage.
// The setup regression is outside this spec's delivery contract.
if (!Neo.get) Neo.get = () => null;

/**
 * @summary Unit coverage for the turn-started presence writer substrate.
 *
 * The writer is deliberately independent from wake-route process presence and completed-turn
 * memory writes. It records an active interval at turn start, refreshes it during long turns, and
 * terminalizes it when a lifecycle terminal proof such as `add_memory` succeeds.
 */
test.describe('Neo.ai.services.memory-core.TurnPresenceService', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService, LifecycleService, MemoryService, StorageRouter, TextEmbeddingService, TurnPresenceService,
        originalGetMemoryCollection, originalEmbedText, originalBuildMiniSummary, originalSchedule, originalAutoSave;

    const ctx = {userId: 'agent-turn', agentIdentityNodeId: '@agent-turn'};

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        MemoryService        = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        TurnPresenceService  = (await import('../../../../../../ai/services/memory-core/TurnPresenceService.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        originalAutoSave                 = GraphService.db.autoSave;
        GraphService.db.autoSave         = true;
        originalGetMemoryCollection      = StorageRouter.getMemoryCollection;
        originalEmbedText                = TextEmbeddingService.embedText;
        originalBuildMiniSummary         = MemoryService.buildMiniSummary;
        originalSchedule                 = MemoryService._scheduleMemoryGraphProjection;
        StorageRouter.getMemoryCollection = async () => ({
            add: async () => {},
            get: async () => ({ids: [], metadatas: []})
        });
        TextEmbeddingService.embedText        = async () => new Array(4096).fill(0.1);
        MemoryService.buildMiniSummary        = async () => null;
        MemoryService._scheduleMemoryGraphProjection = () => {};
    });

    test.afterAll(async () => {
        StorageRouter.getMemoryCollection       = originalGetMemoryCollection;
        TextEmbeddingService.embedText          = originalEmbedText;
        MemoryService.buildMiniSummary          = originalBuildMiniSummary;
        MemoryService._scheduleMemoryGraphProjection = originalSchedule;
        GraphService.db.autoSave                = originalAutoSave;

        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();
    });

    test.beforeEach(async () => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        GraphService.upsertNode({id: '@agent-turn', type: 'AgentIdentity', name: 'Agent Turn', properties: {}});
    });

    const asAgent = fn => RequestContextService.run(ctx, fn);
    const getNode = turnId => GraphService.db.nodes.get(`AGENT_TURN_PRESENCE:@agent-turn:${turnId}`);

    test('records a bounded active turn interval at start', async () => {
        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'turn-start',
            source: 'spec',
            now   : '2026-06-19T00:00:00.000Z'
        }));

        expect(result.status).toBe('recorded');
        expect(result.turnId).toBe('turn-start');
        expect(result.startedAt).toBe('2026-06-19T00:00:00.000Z');
        expect(result.lastProgressAt).toBe('2026-06-19T00:00:00.000Z');
        expect(result.freshUntil).toBe('2026-06-19T00:30:00.000Z');
        expect(result.expiresAt).toBe('2026-06-19T01:00:00.000Z');
        expect(result.terminalState).toBe(null);
        expect(result.status).toBe('recorded');

        const node = getNode('turn-start');
        expect(node.label).toBe('AGENT_TURN_PRESENCE');
        expect(node.properties.status).toBe('active');
        expect(node.properties.source).toBe('spec');
    });

    test('refreshes progress without changing startedAt', async () => {
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'turn-progress',
            now   : '2026-06-19T00:00:00.000Z'
        }));

        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'progress',
            turnId: 'turn-progress',
            now   : '2026-06-19T00:10:00.000Z'
        }));

        expect(result.startedAt).toBe('2026-06-19T00:00:00.000Z');
        expect(result.lastProgressAt).toBe('2026-06-19T00:10:00.000Z');
        expect(result.freshUntil).toBe('2026-06-19T00:40:00.000Z');
        expect(result.expiresAt).toBe('2026-06-19T01:10:00.000Z');
        expect(getNode('turn-progress').properties.status).toBe('active');
    });

    test('terminal update without turnId closes the newest active interval', async () => {
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'older-turn',
            now   : '2026-06-19T00:00:00.000Z'
        }));
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'newer-turn',
            now   : '2026-06-19T00:05:00.000Z'
        }));

        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action       : 'terminal',
            terminalState: 'blocked',
            source       : 'blocked-task-state',
            now          : '2026-06-19T00:06:00.000Z'
        }));

        expect(result.turnId).toBe('newer-turn');
        expect(result.terminalState).toBe('blocked');
        expect(result.source).toBe('blocked-task-state');
        expect(getNode('newer-turn').properties.status).toBe('terminal');
        expect(getNode('older-turn').properties.status).toBe('active');
    });

    test('terminal update returns noop when no active turn exists', async () => {
        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action       : 'terminal',
            terminalState: 'completed',
            now          : '2026-06-19T00:00:00.000Z'
        }));

        expect(result).toEqual({
            status       : 'noop',
            reason       : 'no-active-turn',
            action       : 'terminal',
            agentIdentity: '@agent-turn'
        });
    });

    test('successful add_memory terminalizes the active turn interval', async () => {
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'memory-turn',
            source: 'spec'
        }));

        const result = await asAgent(() => MemoryService.addMemory({
            prompt  : 'turn-presence prompt',
            thought : 'turn-presence thought',
            response: 'turn-presence response'
        }));

        expect(result.message).toBe('Memory successfully added');

        const node = getNode('memory-turn');
        expect(node.properties.status).toBe('terminal');
        expect(node.properties.terminalState).toBe('completed');
        expect(node.properties.source).toBe('add_memory');
    });
});
