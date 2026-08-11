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

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../src/core/_export.mjs';
import RequestContextService  from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import fs                     from 'fs';
import path                   from 'path';
import * as yaml              from 'js-yaml';
import {fileURLToPath}        from 'url';
import {buildOutputZodSchema} from '../../../../../../ai/mcp/validation/openApiValidator.mjs';

// Stub Neo.get to keep data-record boot behavior from masking turn-presence coverage.
// The setup regression is outside this spec's delivery contract.
if (!Neo.get) Neo.get = () => null;

// The tool's DECLARED output schema (memory-core openapi.yaml), built with the SAME validator the MCP
// server applies to structured content (`buildOutputZodSchema` — the locus of the client-side -32602).
// A prior version of this spec validated a hand-written response shape, never the declared schema, so a
// buggy `terminalState: null` on `start` passed CI while the live tool errored. Parsing every action's
// real response against this schema is the drift guard that catches that class of divergence.
const repoRoot                 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
      memoryCoreOpenApi        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
      recordTurnPresenceOp     = Object.values(memoryCoreOpenApi.paths['/turn-presence/record']).find(op => op?.operationId === 'record_turn_presence'),
      turnPresenceOutputSchema = buildOutputZodSchema(memoryCoreOpenApi, recordTurnPresenceOp);

/**
 * @summary Unit coverage for the turn-started presence writer substrate.
 *
 * The writer is deliberately independent from wake-route process presence and completed-turn
 * memory writes. It records an active interval at turn start, refreshes it during long turns, and
 * terminalizes it when a lifecycle terminal proof such as `add_memory` succeeds.
 */
let MEMORY_ACCEPTED_MESSAGE;

test.describe('Neo.ai.services.memory-core.TurnPresenceService', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService, LifecycleService, MemoryService, StorageRouter, TextEmbeddingService, TurnPresenceService,
        originalGetMemoryCollection, originalEmbedText, originalBuildMiniSummary, originalSchedule, originalAutoSave;

    const ctx = {userId: 'agent-turn', agentIdentityNodeId: '@agent-turn'};

    test.beforeAll(async () => {
        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        ({default: MemoryService, MEMORY_ACCEPTED_MESSAGE} =
            await import('../../../../../../ai/services/memory-core/MemoryService.mjs'));
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
        expect(result.terminalState).toBeUndefined();
        expect(result.status).toBe('recorded');

        const node = getNode('turn-start');
        expect(node.label).toBe('AGENT_TURN_PRESENCE');
        expect(node.properties.status).toBe('active');
        expect(node.properties.source).toBe('spec');
    });

    test('getFreshTurnPresence vouches the beacon horizons verbatim; a legacy horizonless row vouches null', async () => {
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'turn-horizons',
            source: 'spec',
            now   : '2026-06-19T00:00:00.000Z'
        }));

        // the read runs inside the request context like every production caller (`who_is_online`'s
        // projection) — `getNodeRecord` is context-scoped, so a contextless read answers null
        const beacon = await asAgent(() => TurnPresenceService.getFreshTurnPresence('@agent-turn', '2026-06-19T00:10:00.000Z'));

        expect(beacon.turnId).toBe('turn-horizons');
        expect(beacon.fresh).toBe(true);
        // the horizons are vouched VERBATIM from the beacon the service itself wrote — a banded
        // consumer (active-turn / fresh / recent / dark) grades recency from these without
        // minting a second clock authority; the derived boolean keeps its own contract beside them
        expect(beacon.freshUntil).toBe('2026-06-19T00:30:00.000Z');
        expect(beacon.expiresAt).toBe('2026-06-19T01:00:00.000Z');

        // a legacy beacon written before the horizons existed: vouched as null, never a
        // fabricated timestamp — and still discoverable (an expiresAt-less row stays active to
        // the finder by design, so the fail-honest path is exercised on the REAL query)
        GraphService.upsertNode({
            id        : 'AGENT_TURN_PRESENCE:@agent-turn:turn-legacy',
            type      : 'AGENT_TURN_PRESENCE',
            name      : 'legacy beacon',
            properties: {
                agentIdentity : '@agent-turn',
                lastProgressAt: '2026-06-19T00:20:00.000Z',
                startedAt     : '2026-06-19T00:20:00.000Z',
                status        : 'active',
                turnId        : 'turn-legacy'
            }
        });

        const legacy = await asAgent(() => TurnPresenceService.getFreshTurnPresence('@agent-turn', '2026-06-19T00:21:00.000Z'));

        expect(legacy.turnId).toBe('turn-legacy');   // newest by lastProgressAt wins
        expect(legacy.fresh).toBe(false);            // no freshUntil can never read fresh
        expect(legacy.freshUntil).toBeNull();
        expect(legacy.expiresAt).toBeNull()
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

    test('progress without turnId joins the newest active interval instead of refusing', async () => {
        // A harness hook reaching this over MCP holds no turn id — it stopped querying a database to get
        // one. Requiring the id from a client that cannot know it is precisely what pushed the hook into
        // opening the store directly, so this widening is what removes the incentive for that bypass.
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'hookless-older',
            now   : '2026-06-19T02:00:00.000Z'
        }));
        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start',
            turnId: 'hookless-newer',
            now   : '2026-06-19T02:05:00.000Z'
        }));

        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'progress',
            source: 'claude-post-tool-use',
            now   : '2026-06-19T02:06:00.000Z'
        }));

        expect(result.turnId).toBe('hookless-newer');
        expect(result.startedAt).toBe('2026-06-19T02:05:00.000Z');
        expect(result.lastProgressAt).toBe('2026-06-19T02:06:00.000Z');
        // It must JOIN an interval, never mint a second one for the same turn.
        expect(getNode('hookless-older').properties.lastProgressAt).toBe('2026-06-19T02:00:00.000Z');
    });

    test('progress with no open interval is a no-op, not an error', async () => {
        const result = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'progress',
            now   : '2026-06-19T03:00:00.000Z'
        }));

        // The turn it would refresh has already expired or closed. Refusing the call would turn an
        // ordinary race into a failed write on a path that must never break a session.
        expect(result).toEqual({
            status       : 'noop',
            reason       : 'no-active-turn',
            action       : 'progress',
            agentIdentity: '@agent-turn'
        });
    });

    test('wakeSubmitNonce persists, survives a later progress, and is rejected when malformed', async () => {
        const nonce = '7ac7f929-0e77-4f61-92d2-1f078e871fe4';

        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action         : 'start',
            turnId         : 'turn-nonce',
            wakeSubmitNonce: nonce,
            now            : '2026-06-19T04:00:00.000Z'
        }));

        expect(getNode('turn-nonce').properties.wakeSubmitNonce).toBe(nonce);

        await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'progress',
            turnId: 'turn-nonce',
            now   : '2026-06-19T04:01:00.000Z'
        }));

        // The wake daemon's delivery proof matches on this exact value. A progress event that omitted the
        // nonce must not erase the correlation mid-turn, or the proof degrades to `wake-submit-unknown`
        // for a delivery that demonstrably happened.
        expect(getNode('turn-nonce').properties.wakeSubmitNonce).toBe(nonce);

        // Rejected rather than dropped: a stored-but-unmatchable nonce is indistinguishable from an
        // absent one, so silently normalising it away would report correlation that can never fire.
        // Synchronous throw — asserted through a thunk, because `asAgent(...)` would raise before
        // `expect` ever received a promise to reject.
        expect(() => asAgent(() => TurnPresenceService.recordTurnPresence({
            action         : 'start',
            turnId         : 'turn-bad-nonce',
            wakeSubmitNonce: 'not-a-uuid',
            now            : '2026-06-19T04:02:00.000Z'
        }))).toThrow(/Invalid wakeSubmitNonce/);

        // And nothing was persisted for the rejected call — the validation runs BEFORE the upsert, so a
        // malformed nonce cannot leave a half-written interval behind.
        expect(getNode('turn-bad-nonce')).toBeFalsy();
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

        expect(result.message).toBe(MEMORY_ACCEPTED_MESSAGE);

        const node = getNode('memory-turn');
        expect(node.properties.status).toBe('terminal');
        expect(node.properties.terminalState).toBe('completed');
        expect(node.properties.source).toBe('add_memory');
    });

    // Schema↔handler drift guard — validates every action's REAL emitted response against the tool's
    // DECLARED output schema (not a hand-written shape). `terminalState` is a terminal-only enum with no
    // null member, so a non-terminal `terminalState: null` fails the MCP structured-content validator and
    // errors every call. start/progress must OMIT it; terminal must carry it for all four states.
    test('every action response parses against the DECLARED output schema — start/progress omit terminalState, terminal carries all four states; the pre-fix null shape is rejected (#14582 AC3/AC4)', async () => {
        const start = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'start', turnId: 'schema-turn', source: 'spec', now: '2026-06-19T00:00:00.000Z'
        }));
        expect(() => turnPresenceOutputSchema.parse(start), 'start response must satisfy the declared output schema').not.toThrow();
        expect('terminalState' in start).toBe(false);

        const progress = await asAgent(() => TurnPresenceService.recordTurnPresence({
            action: 'progress', turnId: 'schema-turn', now: '2026-06-19T00:05:00.000Z'
        }));
        expect(() => turnPresenceOutputSchema.parse(progress), 'progress response must satisfy the declared output schema').not.toThrow();
        expect('terminalState' in progress).toBe(false);

        // The full terminal enum — the ticket's AC3 ("terminal verified for all four terminal states").
        for (const terminalState of ['completed', 'blocked', 'aborted', 'stale']) {
            await asAgent(() => TurnPresenceService.recordTurnPresence({
                action: 'start', turnId: `term-${terminalState}`, now: '2026-06-19T00:00:00.000Z'
            }));
            const terminal = await asAgent(() => TurnPresenceService.recordTurnPresence({
                action: 'terminal', turnId: `term-${terminalState}`, terminalState, now: '2026-06-19T00:01:00.000Z'
            }));
            expect(() => turnPresenceOutputSchema.parse(terminal), `terminal:${terminalState} must satisfy the declared output schema`).not.toThrow();
            expect(terminal.terminalState).toBe(terminalState);
        }

        // The exact pre-fix shape: a non-terminal response carrying `terminalState: null` is what the live
        // MCP client rejected with -32602. The declared schema MUST reject it here — proving this fixture
        // catches the drift the old hand-written `toBe(null)` assertion silently encoded.
        expect(() => turnPresenceOutputSchema.parse({...start, terminalState: null})).toThrow();
    });
});
