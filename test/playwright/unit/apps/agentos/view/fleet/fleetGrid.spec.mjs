import {setup} from '../../../../../setup.mjs';

const appName = 'FleetGridTest';

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

test.describe('Fleet cockpit FleetGrid + HealthBar — Store-backed density-ranked grid (#14599)', () => {
    let FleetAgent, FleetGrid, HealthBar, Store, rankFleet, healthCounts;

    const stores = [];

    // a roster from a list of states; agentIds are shuffled-stable so the sort is provable
    const roster = states => states.map((state, i) => ({
        agentId    : `agent-${String((states.length - i)).padStart(2, '0')}`,
        displayName: `Agent ${i}`,
        state
    }));

    // one Store of FleetAgent records per grid — the production data path (an isolated
    // AgentOS.store.FleetRoster shape; keyProperty mirrored per the collection-default shadow)
    const makeStore = rows => {
        const store = Neo.create(Store, {keyProperty: 'agentId', model: FleetAgent, data: rows});

        stores.push(store);

        return store
    };

    const cardsBox   = grid => grid.items.find(item => item.cls.includes('fm-fleet-cards'));
    const agentCards = grid => cardsBox(grid).items.filter(item => item.ntype === 'fm-agent-card');
    const foldRow    = grid => cardsBox(grid).items.find(item => item.cls.includes('fm-fleet-fold'));
    const head       = grid => grid.items.find(item => item.cls.includes('fm-fleet-head'));
    const swatchOf   = (bar, state) => bar.items.find(sw => sw.state === state);

    test.beforeAll(async () => {
        const gridMod = await import('../../../../../../../apps/agentos/view/fleet/FleetGrid.mjs'),
              barMod  = await import('../../../../../../../apps/agentos/view/fleet/HealthBar.mjs');

        FleetGrid    = gridMod.default;
        rankFleet    = gridMod.rankFleet;
        HealthBar    = barMod.default;
        healthCounts = barMod.healthCounts;
        FleetAgent   = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store        = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    test.afterAll(() => {
        stores.forEach(store => store.destroy());
        stores.length = 0
    });

    test('healthCounts is the pure tally — five canonical categories; unknown/guest folds into off (no 6th key, no undercount)', () => {
        const counts = healthCounts(roster(['ok', 'ok', 'idle', 'off', 'limited', 'wedged']));
        expect(counts).toEqual({ok: 2, idle: 1, wedged: 1, limited: 1, off: 1});

        // zero-fill: exactly the five canonical keys, present even when absent
        expect(healthCounts([])).toEqual({ok: 0, idle: 0, wedged: 0, limited: 0, off: 0});

        // unknown / guest / unsupported → off (benched), matching the grid's benched tier — NEVER a literal 6th key
        const withGuest = healthCounts(roster(['ok', 'mysterious', 'guest']));
        expect(withGuest).toEqual({ok: 1, idle: 0, wedged: 0, limited: 0, off: 2});
        expect(Object.keys(withGuest).sort()).toEqual(['idle', 'limited', 'off', 'ok', 'wedged']);
        // the five visible counts sum to the roster size — the bar can never undercount
        expect(Object.values(withGuest).reduce((a, b) => a + b, 0)).toBe(3);

        // non-array guard
        expect(healthCounts(null)).toEqual({ok: 0, idle: 0, wedged: 0, limited: 0, off: 0})
    });

    test('rankFleet tiers deterministically (online → idle → benched, sorted by agentId) with the fold threshold', () => {
        // 4 online (ok/limited/wedged) · 3 idle · 2 benched(off) + 1 unknown-guest → benched tail
        const rank = rankFleet(roster(['ok', 'idle', 'off', 'limited', 'idle', 'wedged', 'off', 'idle', 'guest', 'ok']), {foldThreshold: 12});

        expect(rank.online.length).toBe(4);   // 2 ok + 1 limited + 1 wedged
        expect(rank.idle.length).toBe(3);
        expect(rank.benched.length).toBe(3);   // 2 off + 1 unknown-guest (tail, not dropped)
        expect(rank.total).toBe(10);
        expect(rank.folded).toBe(false);       // 10 < 12

        // deterministic order: each tier sorted by agentId regardless of arrival order
        const ids = rank.online.map(a => a.agentId);
        expect(ids).toEqual([...ids].sort());

        // threshold is inclusive at the boundary
        expect(rankFleet(roster(Array(11).fill('ok')), {foldThreshold: 12}).folded).toBe(false);
        expect(rankFleet(roster(Array(12).fill('ok')), {foldThreshold: 12}).folded).toBe(true);
        expect(rankFleet(roster(Array(20).fill('idle')), {foldThreshold: 12}).folded).toBe(true)
    });

    test('a11y: the roster is a named landmark region (#14619)', () => {
        const grid = Neo.create(FleetGrid, {appName, store: makeStore(roster(['ok', 'idle']))});

        // the roster is a named landmark region so screen-reader users can navigate to it as a
        // distinct cockpit surface; refreshGrid mutates the child cards container (not the root),
        // so the region label persists across store-driven re-renders
        expect(grid.vdom.role).toBe('region');
        expect(grid.vdom['aria-label']).toBe('Fleet roster');

        grid.destroy()
    });

    test('a roster rebuild keeps the roving tab stop on the resident agent IDENTITY, not the numeric index (#14619 @neo-gpt falsifier)', () => {
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 20, store: makeStore(roster(['ok', 'ok', 'ok']))});

        // cards sort by agentId → [agent-01, agent-02, agent-03]; focus the middle one
        grid.focusIndex = 1;
        const focusedId = agentCards(grid)[grid.focusIndex].record.agentId;

        // a joiner that sorts ABOVE the focused agent → every index shifts down by one
        grid.store.add({agentId: 'agent-00', displayName: 'Joiner', state: 'ok'});

        // the tab stop FOLLOWS the resident agent to its new index (1 → 2), not the stale numeric slot
        expect(agentCards(grid)[grid.focusIndex].record.agentId).toBe(focusedId);
        expect(grid.focusIndex).toBe(2);
        expect(agentCards(grid)[grid.focusIndex].vdom.tabIndex).toBe(0); // exactly that card carries the tab stop

        // when the focused agent LEAVES the roster, the tab stop clamps to a valid card — never orphaned
        grid.store.remove(grid.store.get(focusedId));
        expect(agentCards(grid).some(card => card.record.agentId === focusedId)).toBe(false);
        expect(grid.focusIndex).toBeLessThan(agentCards(grid).length);
        expect(agentCards(grid)[grid.focusIndex].vdom.tabIndex).toBe(0);

        grid.destroy()
    });

    test('below threshold the grid renders every record as a card in ranked order — no fold', () => {
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 12, store: makeStore(roster(['ok', 'idle', 'off', 'ok', 'idle', 'wedged']))});

        expect(agentCards(grid).length).toBe(6);   // all six render
        expect(foldRow(grid)).toBeFalsy();          // nothing collapsed
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-title')).text).toBe('Fleet · 6 agents');
        // each card renders from a live store record, not a mapped copy
        expect(agentCards(grid).every(card => card.record.isRecord)).toBe(true);

        grid.destroy()
    });

    test('at/over threshold the idle tier collapses to an honest count — online + benched stay as cards', () => {
        // 4 online · 6 idle · 2 benched = 12 → folded
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 12, store: makeStore(roster([
            'ok', 'ok', 'limited', 'wedged',
            'idle', 'idle', 'idle', 'idle', 'idle', 'idle',
            'off', 'off'
        ]))});

        // online (4) + benched (2) render as cards; the six idle do NOT
        expect(agentCards(grid).length).toBe(6);
        // the fold surfaces the folded idle count — never a silent drop
        expect(foldRow(grid)).toBeTruthy();
        expect(foldRow(grid).text).toBe('6 idle');

        grid.destroy()
    });

    test('a record `state` change re-ranks the grid — the store recordChange IS the reactive layer, no manual diffing', () => {
        const store = makeStore(roster(['ok', 'ok', 'idle'])),
              grid  = Neo.create(FleetGrid, {appName, foldThreshold: 12, store});

        const lastId = () => agentCards(grid).at(-1).record.agentId;

        // pick the first online record and bench it — the card must move to the benched tail
        const first = rankFleet(store.items).online[0];
        expect(lastId()).not.toBe(first.agentId);

        // the grid seats its store onto the header health bar — counts derive from the same records
        const bar = grid.getReference('fleet-health');
        expect(bar.store).toBe(store);
        expect(swatchOf(bar, 'ok').count).toBe(2);

        first.set({state: 'off'});

        expect(agentCards(grid).length).toBe(3);           // still every card — a tier move, not a drop
        expect(lastId()).toBe(first.agentId);              // now the benched tail
        expect(agentCards(grid).at(-1).down({ntype: 'fm-state-dot'}).state).toBe('off');

        // ...and the store-bound health bar re-tallied through ITS OWN record seam (no array push)
        expect(swatchOf(bar, 'ok').count).toBe(1);
        expect(swatchOf(bar, 'off').count).toBe(1);

        grid.destroy()
    });

    test('a non-state record write updates the ONE affected card in place — same card instances, no rebuild', () => {
        const store = makeStore(roster(['ok', 'ok', 'idle'])),
              grid  = Neo.create(FleetGrid, {appName, foldThreshold: 12, store});

        const idsBefore = agentCards(grid).map(card => card.id),
              record    = store.items[0];

        record.set({laneLine: 'rebuilt on records', pendingAction: 'start'});

        // the card set was NOT rebuilt — the same instances survived (the in-place seam)
        expect(agentCards(grid).map(card => card.id)).toEqual(idsBefore);

        // ...and the one affected card re-rendered its record: lane line + the B4 pending render
        const card = agentCards(grid).find(c => c.record === record);
        expect(card.down({reference: 'card-lane'}).text).toBe('rebuilt on records');
        expect(card.down({reference: 'control-verbs'}).items.every(button => button.disabled)).toBe(true);
        expect(card.down({reference: 'control-status'}).text).toBe('start…');

        grid.destroy()
    });

    test('a store load re-derives the surface — adding a resident extends the grid and the title', () => {
        const store = makeStore(roster(['ok', 'idle'])),
              grid  = Neo.create(FleetGrid, {appName, store});

        expect(agentCards(grid).length).toBe(2);

        store.add({agentId: 'agent-99', displayName: 'Joiner', state: 'ok'});

        expect(agentCards(grid).length).toBe(3);
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-title')).text).toBe('Fleet · 3 agents');

        grid.destroy()
    });

    test('HealthBar is Store-bound — counts tally from records and react through the store seam, swatches stable (no rebuild)', () => {
        const store = makeStore(roster(['ok', 'ok', 'idle', 'off'])),
              bar   = Neo.create(HealthBar, {appName, store});

        expect(bar.items.length).toBe(5);
        expect(swatchOf(bar, 'ok').count).toBe(2);
        expect(swatchOf(bar, 'idle').count).toBe(1);
        expect(swatchOf(bar, 'off').count).toBe(1);
        expect(swatchOf(bar, 'wedged').count).toBe(0);   // zero still renders (confirms "none")

        // stable instances: capture ids, mutate a RECORD, assert SAME swatch instances re-tallied
        const idsBefore = bar.items.map(sw => sw.id);
        store.items[2].set({state: 'wedged'});                   // idle → wedged, via the record seam
        expect(bar.items.map(sw => sw.id)).toEqual(idsBefore);   // not recreated → the count transition can animate
        expect(swatchOf(bar, 'idle').count).toBe(0);
        expect(swatchOf(bar, 'wedged').count).toBe(1);

        // a store load (roster growth) re-tallies too
        store.add({agentId: 'agent-99', state: 'ok'});
        expect(swatchOf(bar, 'ok').count).toBe(3);

        // guest/unknown folds into the VISIBLE off swatch — the five-swatch bar never undercounts a roster
        store.items[0].set({state: 'mysterious'});
        expect(bar.items.length).toBe(5);              // still no 6th swatch
        expect(swatchOf(bar, 'off').count).toBe(2);    // off + mysterious rendered as benched
        expect(swatchOf(bar, 'ok').count).toBe(2);

        bar.destroy()
    });

    test('degrades honestly on adapter loss — a stale header, never a blanked grid', () => {
        const grid = Neo.create(FleetGrid, {appName, adapterState: 'stale', store: makeStore(roster(['ok', 'idle', 'off']))});

        expect(head(grid).cls).toContain('is-stale');
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-stale')).text).toBe('stale — reconnecting');
        // the cards still render — degrade surfaces the state, it does not blank the grid
        expect(agentCards(grid).length).toBe(3);

        grid.destroy()
    });

    test('labels the seeded roster honestly — a sample marker until the live source wires', () => {
        const grid = Neo.create(FleetGrid, {appName, adapterState: 'sample', store: makeStore(roster(['ok']))});

        expect(head(grid).cls).toContain('is-sample');
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-stale')).text).toBe('sample roster');
        expect(agentCards(grid).length).toBe(1);

        grid.destroy()
    });

    test('a11y roving-tabindex (#14619): arrows move the single tab stop across the card ring, clamped at both ends', () => {
        const grid  = Neo.create(FleetGrid, {appName, foldThreshold: 12, store: makeStore(roster(['ok', 'ok', 'idle']))});
        const tabOf = () => agentCards(grid).map(card => card.vdom.tabIndex);

        // exactly ONE tab stop: the focusIndex-0 card is 0, every other card is -1 (single grid tab stop)
        expect(grid.focusIndex).toBe(0);
        expect(tabOf()).toEqual([0, -1, -1]);

        // Down/Right advance the active card; the tab stop moves with focusIndex
        grid.onRoveNext();
        expect(grid.focusIndex).toBe(1);
        expect(tabOf()).toEqual([-1, 0, -1]);

        grid.onRoveNext();
        expect(tabOf()).toEqual([-1, -1, 0]);

        // clamp at the end — Down on the last card holds, never wraps out of bounds
        grid.onRoveNext();
        expect(grid.focusIndex).toBe(2);
        expect(tabOf()).toEqual([-1, -1, 0]);

        // Up/Left step back; clamp at 0
        grid.onRovePrev();
        expect(grid.focusIndex).toBe(1);
        grid.onRovePrev();
        grid.onRovePrev();
        expect(grid.focusIndex).toBe(0);
        expect(tabOf()).toEqual([0, -1, -1]);

        grid.destroy()
    });

    test('a11y roving-tabindex (#14619): a roster rebuild clamps a stale focusIndex into range — exactly one tab stop survives, never a dangling out-of-bounds index', () => {
        const store = makeStore(roster(['ok', 'ok', 'idle', 'ok', 'idle'])),
              grid  = Neo.create(FleetGrid, {appName, foldThreshold: 12, store});

        // park the roving focus on the last card, then shrink the roster below that index
        grid.focusIndex = agentCards(grid).length - 1;
        expect(grid.focusIndex).toBeGreaterThan(1);

        store.data = roster(['ok', 'idle']); // fewer residents → the card set rebuilds

        const cards = agentCards(grid);
        expect(grid.focusIndex).toBe(cards.length - 1);                        // clamped into range
        expect(cards.filter(card => card.vdom.tabIndex === 0)).toHaveLength(1); // exactly one tab stop
        expect(cards.filter(card => card.vdom.tabIndex === -1)).toHaveLength(cards.length - 1);

        grid.destroy()
    });
});
