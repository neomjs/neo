import {setup} from '../../../../../../setup.mjs';

const appName = 'CatchUpPaneTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {expect, test}                       from '@playwright/test';
import Neo                                  from '../../../../../../../../src/Neo.mjs';
import * as core                            from '../../../../../../../../src/core/_export.mjs';
import InstanceManager                      from '../../../../../../../../src/manager/Instance.mjs';
import CatchUpPane, {resolveCitationTarget} from '../../../../../../../../apps/agentos/view/fleet/catchup/Container.mjs';

const WINDOW = {
    semantics  : 'half-open',
    windowStart: '2026-07-17T12:00:00.000Z',
    windowEnd  : '2026-07-18T12:00:00.000Z'
};

function envelope(overrides = {}) {
    return {
        notAuthority      : true,
        generatedAt       : WINDOW.windowEnd,
        sourceManifestHash: 'a1b2c3d4',
        coverage          : {totalResolved: 2, included: 2, degraded: false},
        citations         : [],
        synthesisAvailable: true,
        synthesis         : 'Source-owned narrative',
        ...overrides
    }
}

function snapshot(overrides = {}) {
    return {
        capability         : {state: 'wired', capturedAt: WINDOW.windowEnd},
        needsFirstUseWindow: false,
        partition          : 'unified',
        viewerState        : {lastSeen: null, lastVisitAt: WINDOW.windowEnd},
        window             : WINDOW,
        sources            : {
            memory      : {source: 'memory', state: 'available', unavailableReason: null, envelope: envelope()},
            pullRequests: {source: 'pull-requests', state: 'available', unavailableReason: null, envelope: envelope({
                sourceManifestHash: 'd4c3b2a1',
                citations         : [{type: 'pull-request', id: 'pull:15470', drillDown: {operation: 'get_conversation', arguments: {pr_number: 15470}}}]
            })}
        },
        ...overrides
    }
}

function createPane(config = {}) {
    return Neo.create(CatchUpPane, {appName, ...config})
}

test.describe('AgentOS.view.fleet.catchup.Container — invoked source-owned history', () => {
    test('first use is an explicit choice and never renders fabricated empty history', () => {
        const pane = createPane({snapshot: {
            capability         : {state: 'wired', capturedAt: WINDOW.windowEnd},
            needsFirstUseWindow: true,
            partition          : 'unified',
            viewerState        : {lastSeen: null, lastVisitAt: null},
            window             : null,
            sources            : null
        }});

        expect(pane.getReference('catch-up-first-use').hidden).toBe(false);
        expect(pane.getReference('catch-up-mark').hidden).toBe(true);
        expect(pane.getReference('catch-up-window').text).toBe('No runtime anchor yet');
        expect(pane.contentStore.getCount()).toBe(0);
        expect(pane.getReference('catch-up-sources').items[0].text).toContain('No history window is invented');

        pane.destroy()
    });

    test('renders both source slots independently with provenance, bounds, and canonical PR drill', () => {
        const pane = createPane({snapshot: snapshot()});

        expect(pane.contentStore.getCount()).toBe(2);
        expect(pane.getReference('catch-up-window').text).toContain('whole fleet');
        expect(pane.getReference('catch-up-mark').hidden).toBe(false);

        const [memoryCard, pullCard] = pane.getReference('catch-up-sources').items;

        expect(memoryCard.cls).toContain('is-available');
        expect(memoryCard.items[1].text).toContain('not authority');
        expect(memoryCard.items[1].text).toContain('manifest a1b2c3d4');
        expect(memoryCard.items[2].text).toBe('Source-owned narrative');

        const citation = pullCard.items.find(item => item.cls?.includes('fm-catch-up-citations')).items[0];
        expect(citation.vdom.href).toBe('https://github.com/neomjs/neo/pull/15470');
        expect(citation.vdom.rel).toBe('noopener noreferrer');

        pane.destroy()
    });

    test('one degraded or unavailable source never erases or recolors its healthy peer', () => {
        const pane = createPane({snapshot: snapshot({sources: {
            memory: {
                source           : 'memory',
                state            : 'degraded',
                unavailableReason: null,
                envelope         : envelope({
                    coverage                  : {totalResolved: 7, included: 3, degraded: true, degradedReason: 'bounded corpus gap'},
                    synthesisAvailable        : false,
                    synthesisUnavailableReason: 'coverage-degraded'
                })
            },
            pullRequests: {source: 'pull-requests', state: 'unavailable', unavailableReason: 'pull-requests-history-unavailable', envelope: null}
        }})});

        const [memoryCard, pullCard] = pane.getReference('catch-up-sources').items;

        expect(memoryCard.cls).toContain('is-degraded');
        expect(memoryCard.items.some(item => item.text?.includes('bounded corpus gap'))).toBe(true);
        expect(pullCard.cls).toContain('is-unavailable');
        expect(pullCard.items[2].text).toBe('pull-requests-history-unavailable');

        pane.destroy()
    });

    test('partition, first-use, exact mark, and live adjacency remain intent-only', () => {
        const pane = createPane({
                  partitionOptions: [{id: 'ada', label: 'Ada', partition: '@neo-opus-ada'}],
                  snapshot        : snapshot()
              }),
              events = [];

        pane.fire = (name, data) => events.push([name, data]);
        pane.onPartitionClick('@neo-opus-ada');
        pane.onWeeklyClick();
        pane.onMarkClick();
        pane.onLiveActivityClick();

        expect(events).toEqual([
            ['historyRequest', {partition: '@neo-opus-ada'}],
            ['historyRequest', {firstUsePreset: 'weekly', partition: '@neo-opus-ada'}],
            ['markCaughtUpRequest', {windowEnd: WINDOW.windowEnd}],
            ['liveSurfaceRequest', {target: 'activity-stream'}]
        ]);
        expect(pane.partitionStore.items.map(record => record.partition)).toEqual(['unified', '@neo-opus-ada']);

        pane.destroy()
    });

    test('citation routing accepts only canonical PR descriptors or pull identities', () => {
        expect(resolveCitationTarget({drillDown: {operation: 'get_conversation', arguments: {pr_number: 42}}}))
            .toBe('https://github.com/neomjs/neo/pull/42');
        expect(resolveCitationTarget({id: 'pull:77'})).toBe('https://github.com/neomjs/neo/pull/77');
        expect(resolveCitationTarget({id: 'memory:77', sessionId: 's-1'})).toBeNull();
        expect(resolveCitationTarget({drillDown: {operation: 'open_session', arguments: {pr_number: 42}}})).toBeNull()
    })
});
