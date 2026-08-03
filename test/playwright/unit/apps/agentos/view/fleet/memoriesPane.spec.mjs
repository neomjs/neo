import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MemoriesPaneCoherenceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';
import MemoriesPane   from '../../../../../../../apps/agentos/view/fleet/MemoriesPane.mjs';

const AGENT_OPTIONS = [
    {id: 'memories-ada',  label: 'Ada',  agentIdentity: '@neo-opus-ada'},
    {id: 'memories-clio', label: 'Clio', agentIdentity: '@neo-fable-clio'}
];

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
              agentOptions: AGENT_OPTIONS,
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

        pane.onAgentClick('@neo-opus-ada');
        expect(requests).toEqual([{agentIdentity: '@neo-opus-ada'}]);

        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        expect(pane.summaryStore.count).toBe(2);
        expect(pane.getReference('memories-more').hidden).toBe(false);

        // the switch: old target's cards and continuation die NOW, before any response
        pane.onAgentClick('@neo-fable-clio');
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

        pane.onAgentClick('@neo-opus-ada');
        pane.snapshot = envelope({target: '@neo-opus-ada', sessions: [row('a1'), row('a2')], total: 3});
        pane.onAgentClick('@neo-fable-clio');

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

        pane.onAgentClick('@neo-opus-ada');
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
        expect(pane.getReference('memories-meta').text).toBe('Pick an agent to read their recent sessions.');
        expect(pane.getReference('memories-more').hidden).toBe(true);
        expect(pane.getReference('memories-refresh').hidden).toBe(true);
        expect(requests).toEqual([])
    });
});
