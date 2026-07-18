import {expect, test}             from '@playwright/test';
import {createFleetCatchUpSource} from '../../../../../../ai/services/fleet/fleetCatchUpSource.mjs';

const HEALTHY_MEMORY = {
    notAuthority      : true,
    generatedAt       : '2026-07-18T12:00:00.000Z',
    coverage          : {totalResolved: 1, included: 1, degraded: false},
    citations         : [{id: 'memory:1', sessionId: 'session-1'}],
    synthesisAvailable: true,
    synthesis         : 'Memory narrative'
};

const HEALTHY_PULLS = {
    notAuthority      : true,
    generatedAt       : '2026-07-18T12:00:00.000Z',
    coverage          : {totalResolved: 1, included: 1, degraded: false},
    citations         : [{id: 'pull:15470'}],
    synthesisAvailable: true,
    synthesis         : 'PR narrative'
};

function harness({viewer='@neo-gpt-emmy', now='2026-07-18T12:00:00.000Z'} = {}) {
    const calls = {memory: [], pulls: []},
          state = {viewer, now};

    const source = createFleetCatchUpSource({
        exploreMemoryHistory: async args => {
            calls.memory.push(args);
            return HEALTHY_MEMORY
        },
        explorePullRequestHistory: async args => {
            calls.pulls.push(args);
            return HEALTHY_PULLS
        },
        resolveViewerIdentity: () => state.viewer,
        now                  : () => new Date(state.now)
    });

    return {calls, source, state}
}

test.describe('fleetCatchUpSource — viewer-bound runtime anchor + independent source envelopes', () => {
    test('first visit requires an explicit window choice and invokes neither source', async () => {
        const {calls, source} = harness(),
              result          = await source.readHistory();

        expect(result).toMatchObject({
            needsFirstUseWindow: true,
            partition          : 'unified',
            window             : null,
            sources            : null,
            viewerState        : {lastSeen: null, lastVisitAt: null}
        });
        expect(calls).toEqual({memory: [], pulls: []})
    });

    test('first-use choice resolves one exact half-open window and preserves both envelopes', async () => {
        const {calls, source} = harness(),
              result          = await source.readHistory({firstUsePreset: 'daily'});

        expect(calls.memory).toEqual([{
            partition  : 'unified',
            windowStart: '2026-07-17T12:00:00.000Z',
            windowEnd  : '2026-07-18T12:00:00.000Z'
        }]);
        expect(calls.pulls).toEqual([{
            resolution : 'all_resolved',
            windowStart: '2026-07-17T12:00:00.000Z',
            windowEnd  : '2026-07-18T12:00:00.000Z'
        }]);
        expect(result.sources.memory.envelope).toBe(HEALTHY_MEMORY);
        expect(result.sources.pullRequests.envelope).toBe(HEALTHY_PULLS);
        expect(result).toMatchObject({
            capability         : {state: 'wired'},
            needsFirstUseWindow: false,
            viewerState        : {lastSeen: null, lastVisitAt: '2026-07-18T12:00:00.000Z'},
            window             : {semantics: 'half-open'}
        })
    });

    test('per-agent drill changes only the Memory partition', async () => {
        const {calls, source} = harness(),
              window          = {windowStart: '2026-07-17T00:00:00.000Z', windowEnd: '2026-07-18T00:00:00.000Z'};

        await source.readHistory({...window, partition: 'unified'});
        await source.readHistory({...window, partition: '@neo-opus-ada'});

        expect(calls.memory.map(call => call.partition)).toEqual(['unified', '@neo-opus-ada']);
        expect(calls.pulls[0]).toEqual(calls.pulls[1]);
        expect(calls.pulls[1]).not.toHaveProperty('partition')
    });

    test('one rejected source is unavailable without erasing the healthy peer source', async () => {
        const source = createFleetCatchUpSource({
            exploreMemoryHistory     : async () => { throw new Error('memory down') },
            explorePullRequestHistory: async () => HEALTHY_PULLS,
            resolveViewerIdentity    : () => '@neo-gpt-emmy',
            now                      : () => new Date('2026-07-18T12:00:00.000Z')
        }),
              result = await source.readHistory({firstUsePreset: 'daily'});

        expect(result.capability.state).toBe('degraded');
        expect(result.sources.memory).toEqual({
            source           : 'memory',
            state            : 'unavailable',
            unavailableReason: 'memory-history-unavailable',
            envelope         : null
        });
        expect(result.sources.pullRequests.envelope).toBe(HEALTHY_PULLS)
    });

    test('a source-owned degraded envelope stays intact and degrades only its own slot', async () => {
        const degraded = {
                  ...HEALTHY_PULLS,
                  coverage                  : {totalResolved: 2, included: 1, degraded: true, degradedReason: 'local-corpus-incomplete'},
                  synthesis                 : null,
                  synthesisAvailable        : false,
                  synthesisUnavailableReason: 'coverage-incomplete'
              },
              source = createFleetCatchUpSource({
                  exploreMemoryHistory     : async () => HEALTHY_MEMORY,
                  explorePullRequestHistory: async () => degraded,
                  resolveViewerIdentity    : () => '@neo-gpt-emmy',
                  now                      : () => new Date('2026-07-18T12:00:00.000Z')
              }),
              result = await source.readHistory({firstUsePreset: 'daily'});

        expect(result.sources.memory.state).toBe('available');
        expect(result.sources.pullRequests.state).toBe('degraded');
        expect(result.sources.pullRequests.envelope).toBe(degraded);
        expect(result.sources.pullRequests.envelope.coverage.degradedReason).toBe('local-corpus-incomplete')
    });

    test('lastSeen advances only through the exact rendered end and remains viewer-isolated', async () => {
        const {source, state} = harness();

        await source.readHistory({firstUsePreset: 'daily'});

        await expect(source.markCaughtUp({windowEnd: '2026-07-18T11:59:00.000Z'})).resolves.toEqual({
            status: 'rejected', reason: 'window-not-latest-rendered'
        });
        await expect(source.markCaughtUp({windowEnd: '2026-07-18T12:00:00.000Z'})).resolves.toMatchObject({
            status: 'advanced', lastSeen: '2026-07-18T12:00:00.000Z'
        });
        await expect(source.markCaughtUp({windowEnd: '2026-07-18T12:00:00.000Z'})).resolves.toEqual({
            status: 'rejected', reason: 'non-monotonic-window'
        });

        state.viewer = '@neo-opus-ada';
        await expect(source.readHistory()).resolves.toMatchObject({needsFirstUseWindow: true});

        state.viewer = '@neo-gpt-emmy';
        state.now    = '2026-07-18T13:00:00.000Z';
        await expect(source.readHistory()).resolves.toMatchObject({
            window: {windowStart: '2026-07-18T12:00:00.000Z', windowEnd: '2026-07-18T13:00:00.000Z'}
        })
    });

    test('future/reversed reads refuse and a process restart resets runtime anchors', async () => {
        const {source} = harness();

        await expect(source.readHistory({
            windowStart: '2026-07-18T11:00:00.000Z',
            windowEnd  : '2026-07-18T13:00:00.000Z'
        })).rejects.toThrow('future');
        await expect(source.readHistory({
            windowStart: '2026-07-18T11:00:00.000Z',
            windowEnd  : '2026-07-18T10:00:00.000Z'
        })).rejects.toThrow('before');

        await source.readHistory({firstUsePreset: 'daily'});

        const restarted = harness().source;

        await expect(restarted.readHistory()).resolves.toMatchObject({needsFirstUseWindow: true})
    });

    test('caller-carried viewer identity cannot select the runtime state key', async () => {
        const {source, state} = harness();

        await source.readHistory({firstUsePreset: 'daily', viewerIdentity: '@neo-opus-ada'});
        await source.markCaughtUp({windowEnd: '2026-07-18T12:00:00.000Z'});

        state.viewer = '@neo-opus-ada';
        await expect(source.readHistory()).resolves.toMatchObject({needsFirstUseWindow: true})
    });

    test('a slower old read cannot steal the rendered-window anchor from a newer request', async () => {
        const pending = [],
              source  = createFleetCatchUpSource({
                  exploreMemoryHistory     : args => new Promise(resolve => pending.push({args, resolve})),
                  explorePullRequestHistory: async () => HEALTHY_PULLS,
                  resolveViewerIdentity    : () => '@neo-gpt-emmy',
                  now                      : () => new Date('2026-07-18T12:00:00.000Z')
              }),
              oldWindow = {
                  windowStart: '2026-07-16T00:00:00.000Z',
                  windowEnd  : '2026-07-17T00:00:00.000Z'
              },
              newWindow = {
                  windowStart: '2026-07-17T00:00:00.000Z',
                  windowEnd  : '2026-07-18T00:00:00.000Z'
              },
              oldRead = source.readHistory(oldWindow),
              newRead = source.readHistory(newWindow);

        await expect.poll(() => pending.length).toBe(2);
        pending[1].resolve(HEALTHY_MEMORY);
        await newRead;
        pending[0].resolve(HEALTHY_MEMORY);
        await oldRead;

        await expect(source.markCaughtUp({windowEnd: newWindow.windowEnd}))
            .resolves.toMatchObject({status: 'advanced', lastSeen: newWindow.windowEnd});
        await expect(source.markCaughtUp({windowEnd: oldWindow.windowEnd}))
            .resolves.toEqual({status: 'rejected', reason: 'window-not-latest-rendered'})
    });
});
