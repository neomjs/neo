import {setup} from '../../../../../setup.mjs';

const appName = 'FleetAgentDetailTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import Instance       from '../../../../../../../src/manager/Instance.mjs';

/**
 * @summary Tests for the FM cockpit AgentDetail drill-in view — the identity
 * header (name-as-display-state over the durable id, engine-as-metadata, family rebind in place,
 * no role fields) over the four SSOT panes, each freshness-labeled per §2.2.1 (fresh/stale/lost
 * from a wired ledger, honest `unobserved` until a feed lands). `now` is injected + pinned so the
 * freshness contract renders deterministically.
 */
test.describe('Fleet cockpit AgentDetail — drill-in inspector (#14608)', () => {
    let AgentDetail, FleetAgent, Store;

    const
        stores          = [],
        // a fixed clock + observations at fixed offsets; a wired runtime so the state dot can render live
        NOW             = Date.parse('2026-07-12T00:00:00.000Z'),
        observedSources = {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        };

    // a real store-backed record — the production shape (an AgentOS.store.FleetRoster row). The store
    // mirrors FleetRoster's keyProperty (the collection default 'id' would shadow the model's).
    const makeRecord = data => {
        const row   = {...data, sources: data.sources === undefined ? observedSources : data.sources},
              store = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent, data: [row]});

        stores.push(store);

        return store.get(data.agentId)
    };

    const createDetail = (data, config = {}) => Neo.create(AgentDetail, {appName, now: NOW, record: makeRecord(data), ...config});

    // the cockpit routes the store's recordChange to the view; standalone units drive the same seam.
    const applySet = (detail, values) => {
        detail.record.set(values);
        detail.applyRecord()
    };

    const chip = (detail, key) => detail.down({reference: `pane-${key}-freshness`});
    const body = (detail, key) => detail.down({reference: `pane-${key}-body`});

    test.beforeAll(async () => {
        AgentDetail = (await import('../../../../../../../apps/agentos/view/fleet/AgentDetail.mjs')).default;
        FleetAgent  = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store       = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    test.afterAll(() => {
        stores.forEach(store => store.destroy());
        stores.length = 0
    });

    test('no record → the honest empty state; header + panes hidden until a resident is selected', () => {
        const detail = Neo.create(AgentDetail, {appName});

        expect(detail.down({reference: 'detail-empty'}).hidden).toBe(false);
        expect(detail.down({reference: 'detail-header'}).hidden).toBe(true);
        expect(detail.down({reference: 'detail-panes'}).hidden).toBe(true);

        detail.destroy()
    });

    test('a11y: the drill is a named landmark region that survives a record re-seat (#14619)', () => {
        const detail = createDetail({
            agentId: 'vega', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'ok'
        });

        // the drill is a named landmark region so screen-reader users land in a labeled region on
        // drill-in (not an unnamed pane)
        expect(detail.vdom.role).toBe('region');
        expect(detail.vdom['aria-label']).toBe('Agent detail');

        // applyRecord re-seats via child-reference .set() and never replaces the root, so the region
        // MUST survive a re-seat — a returning agent selection must not silently drop the landmark
        applySet(detail, {displayName: 'Vega Prime'});
        expect(detail.vdom.role).toBe('region');
        expect(detail.vdom['aria-label']).toBe('Agent detail');

        detail.destroy()
    });

    test('a selected resident renders the ADR-0032 identity header + reveals the panes; no per-view provider', () => {
        const detail = createDetail({
            agentId: 'vega', avatarUrl: 'vega.png', displayName: 'Vega', family: 'claude', engineTag: 'opus-4.8', state: 'ok'
        });

        // one record surface, zero providers
        expect(detail.record.agentId).toBe('vega');
        expect(detail.stateProvider ?? null).toBeNull();

        // empty state gone, header + panes shown
        expect(detail.down({reference: 'detail-empty'}).hidden).toBe(true);
        expect(detail.down({reference: 'detail-header'}).hidden).toBe(false);
        expect(detail.down({reference: 'detail-panes'}).hidden).toBe(false);

        // identity header: family rail + state dot + name/engine/id from the record
        expect(detail.down({ntype: 'fm-family-rail'}).family).toBe('claude');
        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('ok');
        expect(detail.down({ntype: 'image'}).src).toBe('vega.png');
        expect(detail.down({reference: 'detail-name'}).text).toBe('Vega');
        expect(detail.down({reference: 'detail-engine'}).text).toBe('opus-4.8');
        // the durable anchor is always shown — name is display state OVER it (§2.3.2)
        expect(detail.down({reference: 'detail-id'}).text).toBe('vega');

        detail.destroy()
    });

    test('ADR-0032 §2.3.2: name/engine are display state over the durable id — a rename re-renders in place, never a re-key', () => {
        const detail   = createDetail({agentId: 'vega', displayName: 'Vega', engineTag: 'opus-4.8', state: 'ok'});
        const beforeId = detail.id;

        applySet(detail, {displayName: 'Vega (renamed)', engineTag: 'fable-5'});

        expect(detail.id).toBe(beforeId);           // the SAME instance — identity is the durable id
        expect(detail.record.agentId).toBe('vega');
        expect(detail.down({reference: 'detail-name'}).text).toBe('Vega (renamed)');
        expect(detail.down({reference: 'detail-engine'}).text).toBe('fable-5');
        expect(detail.down({reference: 'detail-id'}).text).toBe('vega');

        detail.destroy()
    });

    test('ADR-0032 §2.3.3: a cross-family swap rebinds the rail in place — the SAME resident, not a new self', () => {
        const detail   = createDetail({agentId: 'vega', family: 'claude', state: 'ok'});
        const beforeId = detail.id;

        applySet(detail, {family: 'gpt'});

        expect(detail.id).toBe(beforeId);
        expect(detail.down({ntype: 'fm-family-rail'}).family).toBe('gpt');

        detail.destroy()
    });

    test('a null displayName falls back to the durable id, never a blank name slot', () => {
        const detail = createDetail({agentId: 'neo-gpt-emmy', displayName: null, state: 'ok'});

        expect(detail.down({reference: 'detail-name'}).text).toBe('neo-gpt-emmy');

        detail.destroy()
    });

    test('participationStatus renders as availability (not a role); an unstamped status hides the line', () => {
        const detail = createDetail({agentId: 'gem', participationStatus: 'operator_benched', state: 'off'});

        const line = detail.down({reference: 'detail-participation'});
        expect(line.hidden).toBe(false);
        expect(line.text).toBe('operator benched');

        // null (no identity-root fact) → hidden, never guessed
        applySet(detail, {participationStatus: null});
        expect(detail.down({reference: 'detail-participation'}).hidden).toBe(true);

        detail.destroy()
    });

    test('the state dot is gated on a wired runtime source — missing runtime evidence never renders live', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'});

        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('ok');
        expect(detail.down({ntype: 'fm-state-dot'}).live).toBe(true);

        applySet(detail, {sources: {
            ...observedSources,
            runtime: {source: 'fleet:runtimeStatus', state: 'not-wired', confidence: 'none'}
        }});
        expect(detail.down({ntype: 'fm-state-dot'}).state).toBe('off');
        expect(detail.down({ntype: 'fm-state-dot'}).live).toBe(false);

        detail.destroy()
    });

    test('§2.2.1 freshness: each pane renders its ledger class — fresh/stale/lost from observedAt, unobserved with no ledger', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'}, {
            paneLedgers: {
                'thought-stream': {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: 30_000}, // 10s → fresh
                lane            : {observedAt: '2026-07-11T23:58:30.000Z', freshnessTtl: 30_000}, // 90s → stale
                repo            : {lost: true}                                                    // explicit → lost
                // prs: no ledger → unobserved
            }
        });

        expect(chip(detail, 'thought-stream').cls).toContain('is-fresh');
        expect(chip(detail, 'thought-stream').text).toBe('updated 10s ago');
        expect(chip(detail, 'lane').cls).toContain('is-stale');
        expect(chip(detail, 'repo').cls).toContain('is-lost');
        expect(chip(detail, 'prs').cls).toContain('is-unobserved');
        expect(chip(detail, 'prs').text).toBe('not observed — source not wired');

        detail.destroy()
    });

    test('§2.2.1 freshness re-labels reactively when a feed stamps a new observation (paneLedgers set)', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'});

        // no ledgers → all unobserved
        expect(chip(detail, 'lane').cls).toContain('is-unobserved');

        // a feed wires the lane ledger → the pane sharpens to timestamped freshness, no re-seat
        detail.paneLedgers = {lane: {observedAt: '2026-07-11T23:59:55.000Z', freshnessTtl: 30_000}}; // 5s → fresh
        expect(chip(detail, 'lane').cls).toContain('is-fresh');
        expect(chip(detail, 'lane').text).toBe('updated 5s ago');

        detail.destroy()
    });

    test('the lane pane body renders the record-known lane line + open-lane count; feed-gated panes degrade honestly', () => {
        const detail = createDetail({agentId: 'vega', laneLine: 'FM cockpit agent detail view', openLaneCount: 17, state: 'ok'});

        expect(body(detail, 'lane').text).toBe('FM cockpit agent detail view · 17 open lanes');
        // a feed-gated pane never fabricates a stream
        expect(body(detail, 'thought-stream').text).toBe('awaiting live feed');

        // no lane reported → honest fallback, no fabricated count
        applySet(detail, {laneLine: null, openLaneCount: null});
        expect(body(detail, 'lane').text).toBe('no current lane reported');

        detail.destroy()
    });

    test('§2.2.1 wall-clock aging: a later `now` re-classifies fresh → lost in place (time-reactive, not just re-seat)', () => {
        const detail = createDetail({agentId: 'vega', state: 'ok'}, {
            paneLedgers: {lane: {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: 30_000}} // 10s before NOW → fresh
        });
        expect(chip(detail, 'lane').cls).toContain('is-fresh');

        // 5 minutes of wall clock later (past 4×TTL) → the SAME pane ages to lost, same instance, no
        // re-seat. Production driver: startFreshnessAging()'s timer re-runs applyPaneFreshness off the
        // live Date.now(); here the injected clock advances deterministically through afterSetNow.
        const beforeId = detail.id;
        detail.now = Date.parse('2026-07-12T00:05:00.000Z');
        expect(detail.id).toBe(beforeId);
        expect(chip(detail, 'lane').cls).toContain('is-lost');

        detail.destroy()
    });

    test('the pop-out affordance is layout-blind: it fires popOutIntent only, and its mode flips icon + accessible label (#14610)', () => {
        const
            detail  = createDetail({agentId: 'vega', state: 'ok'}),
            button  = detail.getReference('detail-popout-button'),
            intents = [];

        detail.on('popOutIntent', data => intents.push(data));

        // docked defaults: the detach affordance, labeled for icon-only accessibility
        expect(button).toBeTruthy();
        expect(button.iconCls).toContain('fa-arrow-up-right-from-square');
        expect(button.vdom['aria-label']).toBe('Pop out to its own window');

        // a click reports INTENT — the view executes no dock/window operation itself
        detail.onPopOutButtonClick();
        expect(intents).toHaveLength(1);
        expect(intents[0].mode).toBe('docked');

        // the owner writes the mode back — the affordance flips to the reattach rendering
        detail.popOutMode = 'windowed';
        expect(button.iconCls).toContain('fa-down-left-and-up-right-to-center');
        expect(button.vdom['aria-label']).toBe('Reattach to the cockpit');

        detail.onPopOutButtonClick();
        expect(intents[1].mode).toBe('windowed');

        detail.destroy()
    });
});
