import {expect, test}              from '@playwright/test';
import {createFleetMemoriesSource} from '../../../../../../ai/services/fleet/fleetMemoriesSource.mjs';

const HEALTHY_RESULT = {
    count: 2,
    turns: [
        {id: 'turn-2', sessionId: 'session-b', timestamp: '2026-08-02T11:00:00.000Z', summary: 'Second turn', summaryFallback: false},
        {id: 'turn-1', sessionId: 'session-a', timestamp: '2026-08-02T10:00:00.000Z', summary: 'First turn',  summaryFallback: true}
    ],
    nextCursor: {timestamp: '2026-08-02T10:00:00.000Z', id: 'turn-1'}
};

function harness({viewer='@neo-fable-clio', now='2026-08-02T12:00:00.000Z', result=HEALTHY_RESULT} = {}) {
    const calls = [],
          state = {viewer, now, result};

    const source = createFleetMemoriesSource({
        queryRecentTurns: async args => {
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

test.describe('fleetMemoriesSource — viewer-bound turn recall with derived projection', () => {
    test('construction refuses missing collaborators', () => {
        expect(() => createFleetMemoriesSource()).toThrow(TypeError);
        expect(() => createFleetMemoriesSource({queryRecentTurns: async () => ({})})).toThrow(TypeError);
        expect(() => createFleetMemoriesSource({resolveViewerIdentity: () => '@a'})).toThrow(TypeError)
    });

    test('default read targets the viewer privately and passes rows through untouched', async () => {
        const {calls, source} = harness(),
              result          = await source.readMemories();

        expect(calls).toEqual([{
            agentIdentity: '@neo-fable-clio',
            detail       : 'summary',
            limit        : 20,
            projection   : 'private'
        }]);
        expect(result.turns).toBe(HEALTHY_RESULT.turns);
        expect(result).toMatchObject({
            capability: {state: 'wired', capturedAt: '2026-08-02T12:00:00.000Z'},
            viewer    : '@neo-fable-clio',
            target    : '@neo-fable-clio',
            projection: 'private',
            page      : {before: null, limit: 20},
            count     : 2,
            nextCursor: {timestamp: '2026-08-02T10:00:00.000Z', id: 'turn-1'}
        })
    });

    test('a peer target derives the public projection — and a caller-supplied projection is discarded', async () => {
        const {calls, source} = harness(),
              result          = await source.readMemories({agentIdentity: '@neo-opus-ada', projection: 'private'});

        expect(calls[0]).toMatchObject({agentIdentity: '@neo-opus-ada', projection: 'public'});
        expect(result).toMatchObject({target: '@neo-opus-ada', projection: 'public'})
    });

    test('the @me alias and non-canonical identities are refused at the boundary', async () => {
        const {calls, source} = harness();

        await expect(source.readMemories({agentIdentity: '@me'})).rejects.toThrow('alias');
        await expect(source.readMemories({agentIdentity: 'neo-opus-ada'})).rejects.toThrow('canonical');
        await expect(source.readMemories({agentIdentity: 'AGENT:*'})).rejects.toThrow('canonical');
        expect(calls).toEqual([])
    });

    test('limit outside the closed range refuses instead of clamping', async () => {
        const {calls, source} = harness();

        await expect(source.readMemories({limit: 0})).rejects.toThrow('between 1 and 50');
        await expect(source.readMemories({limit: 51})).rejects.toThrow('between 1 and 50');
        await expect(source.readMemories({limit: 2.5})).rejects.toThrow('between 1 and 50');
        expect(calls).toEqual([]);

        await source.readMemories({limit: 50});
        expect(calls[0].limit).toBe(50)
    });

    test('a paging cursor rides through verbatim and echoes in the page slot', async () => {
        const {calls, source} = harness(),
              cursor          = {timestamp: '2026-08-01T00:00:00.000Z', id: 'turn-0'},
              result          = await source.readMemories({agentIdentity: '@neo-opus-ada', before: cursor});

        expect(calls[0].before).toBe(cursor);
        expect(result.page).toEqual({before: cursor, limit: 20});

        await expect(source.readMemories({before: 'yesterday'})).rejects.toThrow('cursor')
    });

    test('an operation failure is an honest unavailable envelope, never a fabricated empty success', async () => {
        const {source, state} = harness();

        state.result = new Error('plane down');

        const result = await source.readMemories({agentIdentity: '@neo-opus-ada'});

        expect(result).toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-read-failed'},
            viewer    : '@neo-fable-clio',
            target    : '@neo-opus-ada',
            projection: 'public',
            turns     : [],
            count     : 0,
            nextCursor: null
        })
    });

    test('an unrecognized payload is named rather than rendered', async () => {
        const {source, state} = harness();

        state.result = {unexpected: true};

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-payload-unrecognized'},
            turns     : []
        });

        state.result = null;

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-payload-unrecognized'}
        })
    });

    test('a missing cursor and count fall back to honest local facts', async () => {
        const {source, state} = harness();

        state.result = {turns: [{id: 'only', timestamp: '2026-08-02T09:00:00.000Z'}]};

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'wired'},
            count     : 1,
            nextCursor: null
        })
    });

    test('an ingress that binds no canonical viewer refuses every read', async () => {
        const {calls, source, state} = harness();

        state.viewer = null;
        await expect(source.readMemories()).rejects.toThrow('canonical viewer identity');

        state.viewer = 'clio';
        await expect(source.readMemories()).rejects.toThrow('canonical viewer identity');
        expect(calls).toEqual([])
    });
});
