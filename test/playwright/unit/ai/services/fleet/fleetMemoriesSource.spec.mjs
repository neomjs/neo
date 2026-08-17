import {expect, test}              from '@playwright/test';
import {createFleetMemoriesSource} from '../../../../../../ai/services/fleet/fleetMemoriesSource.mjs';

const HEALTHY_RESULT = {
    count    : 2,
    total    : 253,
    summaries: [
        {
            id         : 'summary-2', sessionId: 'session-b', timestamp: '2026-08-02T21:00:00.000Z',
            title      : 'Wake transport contracts', summary: 'Resolved wake-state sync.', category: 'feature',
            memoryCount: 61, quality: 95, impact: 85, sourceAgentIdentities: ['@neo-opus-ada', '@neo-gpt-emmy']
        },
        {
            id         : 'summary-1', sessionId: 'session-a', timestamp: '2026-08-02T19:00:00.000Z',
            title      : 'Terminal audit for PR review', summary: 'Verified five required actions.', category: 'analysis',
            memoryCount: 1, quality: 100, impact: 40, sourceAgentIdentities: ['@neo-gpt-emmy']
        }
    ]
};

function harness({viewer='@neo-fable-clio', now='2026-08-03T08:00:00.000Z', result=HEALTHY_RESULT} = {}) {
    const calls = [],
          state = {viewer, now, result};

    const source = createFleetMemoriesSource({
        getAllSummaries: async args => {
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

test.describe('fleetMemoriesSource — viewer-bound session-summary recall', () => {
    test('construction refuses missing collaborators', () => {
        expect(() => createFleetMemoriesSource()).toThrow(TypeError);
        expect(() => createFleetMemoriesSource({getAllSummaries: async () => ({})})).toThrow(TypeError);
        expect(() => createFleetMemoriesSource({resolveViewerIdentity: () => '@a'})).toThrow(TypeError)
    });

    test('default read targets the viewer and passes rows plus the corpus total through untouched', async () => {
        const {calls, source} = harness(),
              result          = await source.readMemories();

        expect(calls).toEqual([{agentIdentity: '@neo-fable-clio', limit: 20}]);
        expect(result.sessions).toBe(HEALTHY_RESULT.summaries);
        expect(result).toMatchObject({
            capability: {state: 'wired', capturedAt: '2026-08-03T08:00:00.000Z'},
            viewer    : '@neo-fable-clio',
            target    : '@neo-fable-clio',
            page      : {offset: 0, limit: 20},
            count     : 2,
            total     : 253
        })
    });

    test('a peer target rides the wire as the ONLY identity — no viewer claim, no projection axis', async () => {
        const {calls, source} = harness(),
              result          = await source.readMemories({agentIdentity: '@neo-opus-ada', projection: 'private', viewerIdentity: '@smuggled'});

        expect(Object.keys(calls[0]).sort()).toEqual(['agentIdentity', 'limit']);
        expect(calls[0].agentIdentity).toBe('@neo-opus-ada');
        expect(result).toMatchObject({target: '@neo-opus-ada', viewer: '@neo-fable-clio'});
        expect(result).not.toHaveProperty('projection')
    });

    test('the @me alias and non-canonical identities are refused at the boundary', async () => {
        const {calls, source} = harness();

        await expect(source.readMemories({agentIdentity: '@me'})).rejects.toThrow('alias');
        await expect(source.readMemories({agentIdentity: 'neo-opus-ada'})).rejects.toThrow('canonical');
        await expect(source.readMemories({agentIdentity: 'AGENT:*'})).rejects.toThrow('canonical');
        expect(calls).toEqual([])
    });

    test('offset and limit outside their closed ranges refuse instead of coercing', async () => {
        const {calls, source} = harness();

        await expect(source.readMemories({offset: -1})).rejects.toThrow('non-negative');
        await expect(source.readMemories({offset: 2.5})).rejects.toThrow('non-negative');
        await expect(source.readMemories({limit: 0})).rejects.toThrow('between 1 and 50');
        await expect(source.readMemories({limit: 51})).rejects.toThrow('between 1 and 50');
        expect(calls).toEqual([]);

        await source.readMemories({offset: 20, limit: 50});
        expect(calls[0]).toEqual({agentIdentity: '@neo-fable-clio', limit: 50, offset: 20})
    });

    test('a zero offset is not sent — the operation default owns the first page', async () => {
        const {calls, source} = harness();

        const result = await source.readMemories({offset: 0});

        expect(calls[0]).not.toHaveProperty('offset');
        expect(result.page).toEqual({offset: 0, limit: 20})
    });

    test('an operation failure is an honest unavailable envelope, never a fabricated empty corpus', async () => {
        const {source, state} = harness();

        state.result = new Error('plane down');

        const result = await source.readMemories({agentIdentity: '@neo-opus-ada'});

        expect(result).toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-read-failed', detail: 'plane down'},
            viewer    : '@neo-fable-clio',
            target    : '@neo-opus-ada',
            sessions  : [],
            count     : 0,
            total     : null
        })
    });

    test('the failure detail is sanitized: credentials masked, whitespace collapsed, length bounded', async () => {
        const {source, state} = harness();

        // credential family + multi-line noise + oversized tail in one thrown message
        state.result = new Error(`bearer github_pat_11ABCDEF0123456789abcdef refused\n   by   upstream ${'x'.repeat(400)}`);

        const result = await source.readMemories({}),
              detail = result.capability.detail;

        expect(result.capability).toMatchObject({state: 'unavailable', reason: 'memories-read-failed'});
        expect(detail).not.toContain('github_pat_');
        expect(detail).not.toMatch(/\s{2,}/);
        expect(detail.length).toBeLessThanOrEqual(240)
    });

    test('a message-less failure omits the detail field rather than carrying an empty claim', async () => {
        const {source, state} = harness();

        state.result = new Error('');

        const result = await source.readMemories({});

        expect(result.capability).toMatchObject({state: 'unavailable', reason: 'memories-read-failed'});
        expect(result.capability).not.toHaveProperty('detail')
    });

    test('an unrecognized payload is named rather than rendered', async () => {
        const {source, state} = harness();

        state.result = {unexpected: true};

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-payload-unrecognized'},
            sessions  : []
        });

        state.result = null;

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'unavailable', reason: 'memories-payload-unrecognized'}
        })
    });

    test('a genuinely empty corpus stays a WIRED empty page — distinguishable from failure', async () => {
        const {source, state} = harness();

        state.result = {count: 0, total: 0, summaries: []};

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'wired'},
            sessions  : [],
            count     : 0,
            total     : 0
        })
    });

    test('missing count and total fall back to honest local facts', async () => {
        const {source, state} = harness();

        state.result = {summaries: [{id: 'only', timestamp: '2026-08-02T09:00:00.000Z'}]};

        await expect(source.readMemories()).resolves.toMatchObject({
            capability: {state: 'wired'},
            count     : 1,
            total     : 1
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
