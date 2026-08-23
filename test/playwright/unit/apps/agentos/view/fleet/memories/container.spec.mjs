import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MemoriesPaneCoherenceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';
import MemoriesPane   from '../../../../../../../../apps/agentos/view/fleet/memories/Container.mjs';

/**
 * @summary Build one wired source envelope in the exact `fleetMemories` contract shape.
 * @param {Object} options
 * @returns {Object}
 */
function envelope({target, offset = 0, sessions, total}) {
    return {
        capability: {state: 'wired', capturedAt: '2026-08-03T09:00:00.000Z'},
        viewer    : '@e2e-operator',
        target,
        page      : {offset, limit: 20},
        sessions,
        count     : sessions.length,
        total
    }
}

/**
 * @summary One minimal session-summary row.
 * @param {String} id
 * @param {String} [timestamp]
 * @returns {Object}
 */
function row(id, timestamp = '2026-08-02T20:00:00.000Z') {
    return {id, sessionId: `${id}-session`, timestamp, title: `Title ${id}`, summary: `Summary ${id}`, category: 'analysis', memoryCount: 1, quality: 90, impact: 40, sourceAgentIdentities: []}
}

/**
 * @summary Create the pane with captured `memoriesRequest` intents.
 * @param {Object} [config]
 * @returns {{pane: Object, requests: Object[]}}
 */
function createPane(config = {}) {
    const requests = [],
          pane     = Neo.create(MemoriesPane, {
              listeners   : {memoriesRequest: data => {
                  const {source, ...params} = data;
                  requests.push(params)
              }},
              ...config
          });

    return {pane, requests}
}

test.describe('MemoriesPane — target-state coherence (selected target is part of the snapshot key)', () => {
    test('a target switch invalidates old cards and continuation IMMEDIATELY — no stale-depth offset request can be emitted', () => {
        const {pane, requests} = createPane();

        pane.activeAgent = '@neo-opus-ada';
        expect(requests).toEqual([{agentIdentity: '@neo-opus-ada'}]);

        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        expect(pane.summaryStore.count).toBe(2);
        expect(pane.getReference('memories-more').hidden).toBe(false);

        // the switch: old target's cards and continuation die NOW, before any response
        pane.activeAgent = '@neo-fable-clio';
        expect(requests).toEqual([{agentIdentity: '@neo-opus-ada'}, {agentIdentity: '@neo-fable-clio'}]);
        expect(pane.summaryStore.count).toBe(0);
        expect(pane.renderedTarget).toBe(null);
        expect(pane.getReference('memories-meta').text).toBe('Reading @neo-fable-clio…');
        expect(pane.getReference('memories-more').hidden).toBe(true);

        // the reviewer's exact-head probe, replayed: a continuation click in the pending window
        // must be a NO-OP — never `{agentIdentity: '@neo-fable-clio', offset: 2}` off Ada's depth
        pane.onLoadMoreClick();
        expect(requests).toHaveLength(2)
    });

    test('a late foreign-target envelope is NOT adopted; the selected target\'s page zero is', () => {
        const {pane, requests} = createPane();

        pane.activeAgent = '@neo-opus-ada';
        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        pane.activeAgent = '@neo-fable-clio';

        // the stale Ada page lands AFTER the switch — it must not resurrect cards or actions
        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        expect(pane.summaryStore.count).toBe(0);
        expect(pane.renderedTarget).toBe(null);
        expect(pane.getReference('memories-meta').text).toBe('Reading @neo-fable-clio…');
        expect(pane.getReference('memories-more').hidden).toBe(true);

        // the selected target's page zero arrives — NOW the pane adopts
        pane.snapshot = envelope({target: '@neo-fable-clio', sessions: [row('c1')], total: 2});
        expect(pane.summaryStore.count).toBe(1);
        expect(pane.renderedTarget).toBe('@neo-fable-clio');
        expect(pane.getReference('memories-more').hidden).toBe(false);

        // and only then may a continuation fire, anchored on the ACCEPTED page's depth
        pane.onLoadMoreClick();
        expect(requests.at(-1)).toEqual({agentIdentity: '@neo-fable-clio', offset: 1})
    });

    test('a same-target offset continuation appends onto the accepted page zero', () => {
        const {pane} = createPane();

        pane.activeAgent = '@neo-opus-ada';
        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        pane.snapshot = envelope({target: '@neo-opus-ada', offset: 2, sessions: [row('a0', '2026-08-01T10:00:00.000Z')], total: 3});

        expect(pane.summaryStore.count).toBe(3);
        expect(pane.renderedTarget).toBe('@neo-opus-ada');
        expect(pane.getReference('memories-meta').text).toContain('3 of 3 sessions');
        expect(pane.getReference('memories-more').hidden).toBe(true)
    });

    test('rematerializing from an owner-held snapshot derives the selection — no cards without a selection pointing at them', () => {
        const {pane, requests} = createPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3})
        });

        expect(pane.activeAgent).toBe('@neo-opus-ada');
        expect(pane.summaryStore.count).toBe(2);
        expect(pane.renderedTarget).toBe('@neo-opus-ada');
        expect(pane.getReference('memories-more').hidden).toBe(false);
        expect(pane.getReference('memories-refresh').hidden).toBe(false);
        expect(requests).toEqual([])
    });

    test('rematerializing with no held snapshot renders the explicit-choice state and fires nothing', () => {
        const {pane, requests} = createPane();

        expect(pane.activeAgent).toBe(null);
        expect(pane.summaryStore.count).toBe(0);
        expect(pane.getReference('memories-meta').text).toBe('Select an agent card in the roster to read their recent sessions.');
        expect(pane.getReference('memories-more').hidden).toBe(true);
        expect(pane.getReference('memories-refresh').hidden).toBe(true);
        expect(requests).toEqual([])
    });
});


/**
 * @summary Build one wired drill envelope in the exact `fleetSessionMemories` contract shape.
 * @param {Object} options
 * @returns {Object}
 */
function drillEnvelope({sessionId, offset = 0, turns, total}) {
    return {
        capability: {state: 'wired', capturedAt: '2026-08-18T10:00:00.000Z'},
        viewer    : '@e2e-operator',
        sessionId,
        page      : {offset, limit: 20},
        turns,
        count     : turns.length,
        total
    }
}

/**
 * @summary One minimal turn-level memory row.
 * @param {String} id
 * @param {String} sessionId
 * @returns {Object}
 */
function turn(id, sessionId) {
    return {id, sessionId, timestamp: '2026-08-17T18:00:00.000Z', prompt: `Prompt ${id}`, thought: `Thought ${id}`, response: `Response ${id}`, agentIdentity: '@neo-fable-clio', amountToolCalls: 3}
}

test.describe('MemoriesPane — session drill-in (open session is part of the drill snapshot key)', () => {
    /**
     * @summary Pane with captured intents for BOTH event families.
     * @param {Object} [config]
     * @returns {{pane: Object, drills: Object[], closes: Number[]}}
     */
    function createDrillPane(config = {}) {
        const drills = [],
              closes = [],
              pane   = Neo.create(MemoriesPane, {
                  listeners   : {
                      sessionDetailRequest: data => {
                          const {source, ...params} = data;
                          drills.push(params)
                      },
                      sessionDetailClosed: () => closes.push(1)
                  },
                  ...config
              });

        return {pane, drills, closes}
    }

    test('opening a card fires the drill intent and switches the rows zone to the pending drill state', () => {
        const {pane, drills} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1})
        });

        const record = pane.summaryStore.first();

        pane.onCardOpen(record);

        expect(drills).toEqual([{sessionId: 'a1-session', title: 'Title a1'}]);
        expect(pane.drillSession).toEqual({sessionId: 'a1-session', title: 'Title a1'});

        // the rows zone now renders the drill head + pending copy; summary actions hide
        const rows = pane.getReference('memories-rows');

        expect(rows.items.some(item => item.cls?.includes('fm-memories-drill-head'))).toBe(true);
        expect(pane.getReference('memories-refresh').hidden).toBe(true);
        expect(pane.getReference('memories-more').hidden).toBe(true);

        // re-opening the SAME session is a no-op — no duplicate wire intent
        pane.onCardOpen(record);
        expect(drills).toHaveLength(1)
    });

    test('drill coherence: a foreign-session envelope is NOT adopted; the matching one renders authored rows', () => {
        const {pane} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1})
        });

        pane.onCardOpen(pane.summaryStore.first());

        // late foreign-session page: rejected — no rows resurrect, drill stays pending
        pane.drillSnapshot = drillEnvelope({sessionId: 'other-session-id', turns: [turn('x1', 'other-session-id')], total: 1});
        expect(pane.turnStore.count).toBe(0);
        expect(pane.renderedDrillSession).toBe(null);

        // the matching page adopts: turn rows render with the authored provenance vocabulary
        pane.drillSnapshot = drillEnvelope({sessionId: 'a1-session', turns: [turn('t1', 'a1-session'), turn('t2', 'a1-session')], total: 5});
        expect(pane.turnStore.count).toBe(2);
        expect(pane.renderedDrillSession).toBe('a1-session');

        const rows = pane.getReference('memories-rows');

        expect(rows.items.some(item => item.cls?.includes('fm-memories-turn'))).toBe(true);
        expect(rows.items.some(item => item.cls?.includes('fm-memories-drill-more'))).toBe(true)
    });

    test('drill paging guards on accepted page zero and appends by the drill store depth', () => {
        const {pane, drills} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1})
        });

        pane.onCardOpen(pane.summaryStore.first());

        // premature continuation: page zero not accepted yet — a no-op, never a stale-depth offset
        pane.onDrillMoreClick();
        expect(drills).toHaveLength(1);

        pane.drillSnapshot = drillEnvelope({sessionId: 'a1-session', turns: [turn('t1', 'a1-session'), turn('t2', 'a1-session')], total: 5});

        pane.onDrillMoreClick();
        expect(drills.at(-1)).toEqual({sessionId: 'a1-session', title: 'Title a1', offset: 2});

        // the continuation appends — replace stays the default for page zero only
        pane.drillSnapshot = drillEnvelope({sessionId: 'a1-session', offset: 2, turns: [turn('t3', 'a1-session')], total: 5});
        expect(pane.turnStore.count).toBe(3)
    });

    test('back fires the close intent and restores the summary list with its store intact', () => {
        const {pane, closes} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 2})
        });

        pane.onCardOpen(pane.summaryStore.first());
        pane.drillSnapshot = drillEnvelope({sessionId: 'a1-session', turns: [turn('t1', 'a1-session')], total: 1});

        pane.onDrillBackClick();

        expect(closes).toEqual([1]);
        expect(pane.drillSession).toBe(null);
        expect(pane.turnStore.count).toBe(0);
        expect(pane.summaryStore.count).toBe(2);

        const rows = pane.getReference('memories-rows');

        expect(rows.items.some(item => item.cls?.includes('fm-memories-card'))).toBe(true);
        expect(pane.getReference('memories-refresh').hidden).toBe(false)
    });

    test('provenance vocabulary: summary cards carry the derived tag, the drill head the authored tag', () => {
        const {pane} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1})
        });

        const findDeep = (root, cls) => {
            const walk = item => item.cls?.includes(cls) || (item.items || []).some(walk);

            return root.items.some(walk)
        };

        const rows = pane.getReference('memories-rows');

        expect(findDeep(rows, 'is-derived')).toBe(true);

        pane.onCardOpen(pane.summaryStore.first());
        pane.drillSnapshot = drillEnvelope({sessionId: 'a1-session', turns: [turn('t1', 'a1-session')], total: 1});

        expect(findDeep(rows, 'is-authored')).toBe(true);
        expect(findDeep(rows, 'is-derived')).toBe(false)
    });

    test('rematerializing with an owner-held open drill reopens at that depth and fires nothing', () => {
        const {pane, drills} = createDrillPane({
            snapshot     : envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1}),
            drillSession : {sessionId: 'a1-session', title: 'Title a1'},
            drillSnapshot: drillEnvelope({sessionId: 'a1-session', turns: [turn('t1', 'a1-session')], total: 1})
        });

        expect(pane.turnStore.count).toBe(1);
        expect(pane.renderedDrillSession).toBe('a1-session');

        const rows = pane.getReference('memories-rows');

        expect(rows.items.some(item => item.cls?.includes('fm-memories-drill-head'))).toBe(true);
        expect(drills).toEqual([])
    });

    test('an unavailable drill envelope renders the honest unanswered state with its detail', () => {
        const {pane} = createDrillPane({
            snapshot: envelope({target: '@neo-opus-ada', sessions: [row('a1')], total: 1})
        });

        pane.onCardOpen(pane.summaryStore.first());
        pane.drillSnapshot = {
            capability: {state: 'unavailable', reason: 'session-memories-read-failed', capturedAt: '2026-08-18T10:00:00.000Z', detail: 'wire timeout'},
            viewer    : '@e2e-operator',
            sessionId : 'a1-session',
            page      : {offset: 0, limit: 20},
            turns     : [],
            count     : 0,
            total     : null
        };

        expect(pane.turnStore.count).toBe(0);
        expect(pane.renderedDrillSession).toBe(null);

        const rows  = pane.getReference('memories-rows'),
              empty = rows.items.find(item => item.cls?.includes('fm-memories-empty'));

        expect(empty?.text).toContain('did not answer');
        expect(empty?.text).toContain('wire timeout')
    })
});
