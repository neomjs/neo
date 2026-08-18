import {expect, test}                     from '@playwright/test';
import {createFleetSessionMemoriesSource} from '../../../../../../ai/services/fleet/fleetSessionMemoriesSource.mjs';

const HEALTHY_RESULT = {
    sessionId: '7ee47ccf-d1c7-469d-a75e-15cebf3b5ea5',
    count    : 2,
    total    : 13,
    memories : [
        {
            id           : 'mem-2', sessionId: '7ee47ccf-d1c7-469d-a75e-15cebf3b5ea5', timestamp: '2026-08-17T21:58:50.000Z',
            prompt       : 'Operator: sunset', thought: 'Consolidating the day.', response: 'Session closed with handover.',
            agentIdentity: '@neo-fable-clio', amountToolCalls: 4
        },
        {
            id           : 'mem-1', sessionId: '7ee47ccf-d1c7-469d-a75e-15cebf3b5ea5', timestamp: '2026-08-17T13:25:00.000Z',
            prompt       : 'Operator: good morning', thought: 'Recovering context.', response: 'Recovered, lane claimed.',
            agentIdentity: '@neo-fable-clio', amountToolCalls: 9
        }
    ]
};

function harness({viewer='@neo-fable-clio', now='2026-08-18T10:00:00.000Z', result=HEALTHY_RESULT} = {}) {
    const calls = [],
          state = {viewer, now, result};

    const source = createFleetSessionMemoriesSource({
        getSessionMemories: async args => {
            calls.push(args);

            if (state.result instanceof Error) {
                throw state.result
            }

            return state.result
        },
        resolveViewerIdentity: () => state.viewer,
        now                  : () => new Date(state.now)
    });

    return {calls, source, state}
}

test.describe('fleetSessionMemoriesSource — viewer-bound session drill-in', () => {
    test('construction refuses missing collaborators', () => {
        expect(() => createFleetSessionMemoriesSource()).toThrow(TypeError);
        expect(() => createFleetSessionMemoriesSource({getSessionMemories: async () => ({})})).toThrow(TypeError);
        expect(() => createFleetSessionMemoriesSource({resolveViewerIdentity: () => '@a'})).toThrow(TypeError)
    });

    test('a healthy read passes the rows and corpus total through untouched under a wired capability', async () => {
        const {calls, source} = harness(),
              result          = await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId});

        expect(calls).toEqual([{sessionId: HEALTHY_RESULT.sessionId, limit: 20}]);
        expect(result.turns).toBe(HEALTHY_RESULT.memories);
        expect(result).toMatchObject({
            capability: {state: 'wired', capturedAt: '2026-08-18T10:00:00.000Z'},
            viewer    : '@neo-fable-clio',
            sessionId : HEALTHY_RESULT.sessionId,
            page      : {offset: 0, limit: 20},
            count     : 2,
            total     : 13
        })
    });

    test('the session id is the ONLY identity on the wire — no viewer claim, no smuggled axes', async () => {
        const {calls, source} = harness();

        await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, viewerIdentity: '@smuggled', projection: 'private'});

        expect(Object.keys(calls[0]).sort()).toEqual(['limit', 'sessionId'])
    });

    test('a missing or injection-shaped sessionId is refused at the boundary', async () => {
        const {source} = harness();

        await expect(source.readSessionMemories()).rejects.toThrow('canonical session id');
        await expect(source.readSessionMemories({sessionId: ''})).rejects.toThrow('canonical session id');
        await expect(source.readSessionMemories({sessionId: 'short'})).rejects.toThrow('canonical session id');
        await expect(source.readSessionMemories({sessionId: 'x'.repeat(80)})).rejects.toThrow('canonical session id');
        await expect(source.readSessionMemories({sessionId: '../../etc/passwd'})).rejects.toThrow('canonical session id');
        await expect(source.readSessionMemories({sessionId: 'a b c d e f g h'})).rejects.toThrow('canonical session id')
    });

    test('paging is validated, never coerced; a positive offset rides the wire', async () => {
        const {calls, source} = harness();

        await expect(source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, offset: -1})).rejects.toThrow('offset');
        await expect(source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, offset: 1.5})).rejects.toThrow('offset');
        await expect(source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, limit: 0})).rejects.toThrow('limit');
        await expect(source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, limit: 51})).rejects.toThrow('limit');

        await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId, offset: 20, limit: 10});
        expect(calls.at(-1)).toEqual({sessionId: HEALTHY_RESULT.sessionId, limit: 10, offset: 20})
    });

    test('an unbound viewer identity refuses the read before the operation is called', async () => {
        const {calls, source, state} = harness();

        state.viewer = null;
        await expect(source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId})).rejects.toThrow('canonical viewer identity');
        expect(calls).toHaveLength(0)
    });

    test('an operation failure lands as an honest unavailable envelope carrying the redacted detail', async () => {
        const {source, state} = harness(),
              warns           = [],
              origWarn        = console.warn;

        state.result = new Error('read blew up: token ghp_0123456789012345678901234567890123 leaked');
        console.warn = (...args) => warns.push(args.join(' '));

        try {
            const result = await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId});

            expect(result.capability.state).toBe('unavailable');
            expect(result.capability.reason).toBe('session-memories-read-failed');
            expect(result.capability.detail).toContain('read blew up');
            // the shared reduction masks credential families BEFORE bounding
            expect(result.capability.detail).not.toContain('ghp_0123456789012345678901234567890123');
            expect(result.turns).toEqual([]);
            expect(result.total).toBeNull();

            // the server-side copy of the same fact — diagnosability from birth
            expect(warns.some(line => line.includes('session memories read failed') && !line.includes('ghp_0123456789012345678901234567890123'))).toBe(true)
        } finally {
            console.warn = origWarn
        }
    });

    test('an unrecognized payload is unavailable — a wired empty page is claimed only when answered', async () => {
        const {source, state} = harness();

        state.result = {rows: 'not-the-contract'};

        const result = await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId});

        expect(result.capability).toMatchObject({state: 'unavailable', reason: 'session-memories-payload-unrecognized'});
        expect(result.turns).toEqual([]);

        state.result = {sessionId: HEALTHY_RESULT.sessionId, count: 0, total: 0, memories: []};

        const empty = await source.readSessionMemories({sessionId: HEALTHY_RESULT.sessionId});

        expect(empty.capability.state).toBe('wired');
        expect(empty).toMatchObject({turns: [], count: 0, total: 0})
    })
});
