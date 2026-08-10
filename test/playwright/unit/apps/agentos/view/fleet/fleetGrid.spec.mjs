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
    let FleetAgent, FleetGrid, HealthBar, Store, rankFleet, healthCounts, hasAttention;

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
        hasAttention = barMod.hasAttention;
        FleetAgent   = (await import('../../../../../../../apps/agentos/model/FleetAgent.mjs')).default;
        Store        = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    test.afterAll(() => {
        stores.forEach(store => store.destroy());
        stores.length = 0
    });

    test('healthCounts is the pure tally — seven canonical categories through the SAME resolver the cards render; outside-supervision rows count external', () => {
        const zero = {ok: 0, idle: 0, wedged: 0, limited: 0, unobserved: 0, external: 0, off: 0};

        // roster-only rows (no sources) resolve participation-active states to `unobserved` and an
        // un-wired `off` to `external` (supervision vocabulary only where supervision exists —
        // the default-state contract), exactly as the cards display them — the tally and the card
        // grain can never diverge
        const counts = healthCounts(roster(['ok', 'ok', 'idle', 'off', 'limited', 'wedged']));
        expect(counts).toEqual({...zero, unobserved: 5, external: 1});

        // a wired runtime keeps the row state as session truth in the tally too — including `off`,
        // the managed-and-stopped seat that KEEPS its benched bucket
        const wiredSources = {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        };
        expect(healthCounts([{agentId: 'a1', state: 'ok', sources: wiredSources}])).toEqual({...zero, ok: 1});
        expect(healthCounts([{agentId: 'a2', state: 'off', sources: wiredSources}])).toEqual({...zero, off: 1});

        // zero-fill: exactly the seven canonical keys, present even when absent
        expect(healthCounts([])).toEqual(zero);

        // unknown / guest / unsupported rows sit outside any supervision contract → external,
        // matching the resolver's own fold — never an invented benched verdict, never an 8th key
        const withGuest = healthCounts(roster(['ok', 'mysterious', 'guest']));
        expect(withGuest).toEqual({...zero, unobserved: 1, external: 2});
        expect(Object.keys(withGuest).sort()).toEqual(['external', 'idle', 'limited', 'off', 'ok', 'unobserved', 'wedged']);
        // the seven visible counts sum to the roster size — the bar can never undercount
        expect(Object.values(withGuest).reduce((a, b) => a + b, 0)).toBe(3);

        // non-array guard
        expect(healthCounts(null)).toEqual(zero)
    });

    test('hasAttention derives the aggregate header verdict — only actionable buckets carry weight', () => {
        const zero = {ok: 0, idle: 0, wedged: 0, limited: 0, unobserved: 0, external: 0, off: 0};

        // a fleet of un-managed seats with nominal sources is CALM — the operator-ratified
        // default-state contract (a header that is always yellow trains the operator to ignore it)
        expect(hasAttention({...zero, external: 9})).toBe(false);
        expect(hasAttention({...zero, ok: 3, idle: 2, unobserved: 4})).toBe(false);
        // a managed-stopped seat is a fact, not an alarm
        expect(hasAttention({...zero, off: 2})).toBe(false);

        // the actionable states carry the weight
        expect(hasAttention({...zero, wedged: 1})).toBe(true);
        expect(hasAttention({...zero, limited: 1})).toBe(true);

        // fail-closed shapes
        expect(hasAttention({})).toBe(false);
        expect(hasAttention(null)).toBe(false)
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

    test('the presence-capability chip NAMES a degraded producer — and only a degraded one', () => {
        const store = makeStore(roster(['ok', 'idle'])),
              grid  = Neo.create(FleetGrid, {appName, foldThreshold: 12, store}),
              chip  = () => grid.getReference('fleet-presence-cap');

        // no envelope (the boot default): the chip claims nothing
        expect(chip().hidden).toBe(true);

        // a DEGRADED producer renders the named degradation with its retained reason — the
        // roster-level answer to bands vanishing honestly ("no one is online" was a misread of
        // unnamed absence, the live operator falsifier)
        grid.presenceCapability = {source: 'fleet:presenceState', state: 'degraded', confidence: 'none', reason: 'plane who_is_online read failed'};
        expect(chip().hidden).toBe(false);
        expect(chip().text).toBe('presence unobservable · plane who_is_online read failed');
        expect(chip().vdom['aria-label']).toBe('Presence: unobservable. plane who_is_online read failed.');
        expect(chip().vdom.role).toBe('status');

        // a reasonless degradation still names itself
        grid.presenceCapability = {source: 'fleet:presenceState', state: 'degraded', confidence: 'none', reason: null};
        expect(chip().hidden).toBe(false);
        expect(chip().text).toBe('presence unobservable');

        // wired (bands speak for themselves) and not-wired (expected-absent axis — never another
        // permanent line) both render NOTHING; recovery clears the previous claim
        for (const state of ['wired', 'not-wired']) {
            grid.presenceCapability = {source: 'fleet:presenceState', state, confidence: 'observed'};
            expect(chip().hidden, state).toBe(true);
            expect(chip().text, state).toBe('')
        }

        // null (assembler omitted the envelope) clears too
        grid.presenceCapability = {source: 'fleet:presenceState', state: 'degraded', confidence: 'none', reason: 'x'};
        grid.presenceCapability = null;
        expect(chip().hidden).toBe(true);

        grid.destroy();

        // the create-time path: an envelope supplied at construction renders once the reference
        // tree exists (the reactive path skips pre-construction)
        const eager = Neo.create(FleetGrid, {
            appName, foldThreshold: 12, store: makeStore(roster(['ok'])),
            presenceCapability: {source: 'fleet:presenceState', state: 'degraded', confidence: 'none', reason: 'boot-time read failed'}
        });

        expect(eager.getReference('fleet-presence-cap').hidden).toBe(false);
        expect(eager.getReference('fleet-presence-cap').text).toBe('presence unobservable · boot-time read failed');

        eager.destroy()
    });

    test('a11y: named landmark region owning a role=list card container (#14619)', () => {
        const grid = Neo.create(FleetGrid, {appName, store: makeStore(roster(['ok', 'idle']))});

        // the roster is a named landmark region so screen-reader users can navigate to it as a
        // distinct cockpit surface; refreshGrid mutates the child cards container (not the root),
        // so the region label persists across store-driven re-renders
        expect(grid.vdom.role).toBe('region');
        expect(grid.vdom['aria-label']).toBe('Fleet roster');

        // the card container is the role=list OWNER of the role=listitem AgentCards — a listitem needs a
        // list owner to form a valid mounted topology (the mounted witness is FleetGridKeyboardA11y.spec)
        expect(grid.getReference('fleet-cards').vdom.role).toBe('list');

        grid.destroy()
    });

    test('keyboard model (gate-1): drill-only jump handlers exist + no-op off a drill Button; cards are non-interactive listitems, no roving tab stop (#14619)', () => {
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 20, store: makeStore(roster(['ok', 'ok', 'ok']))});

        // no roving tab stop: every card is a NON-interactive listitem (keyboard operability lives on the
        // native child Buttons in ordinary Tab order), so no card carries a tabIndex.
        expect(agentCards(grid).every(card => (card.vdom.tabIndex ?? null) === null)).toBe(true);

        // the roving handlers are gone, replaced by the OPTIONAL Up/Down drill-to-drill jump. With no drill
        // focused (a headless unit — containsFocus is a mounted signal), moveDrillFocus is a safe no-op and
        // never throws; the mounted focus-move + the gate-3 semantic-child restoration across a rebuild are
        // proven in the whitebox-e2e (the mount authority the unit layer cannot exercise).
        expect(typeof grid.onDrillNext).toBe('function');
        expect(typeof grid.onDrillPrev).toBe('function');
        expect(grid.onRoveNext ?? null).toBeNull();
        expect(() => grid.moveDrillFocus(1)).not.toThrow();
        expect(() => grid.moveDrillFocus(-1)).not.toThrow();

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
        // (roster-only rows tally as `unobserved`, exactly as the cards display them)
        const bar = grid.getReference('fleet-health');
        expect(bar.store).toBe(store);
        expect(swatchOf(bar, 'unobserved').count).toBe(3);

        first.set({state: 'off'});

        expect(agentCards(grid).length).toBe(3);           // still every card — a tier move, not a drop
        expect(lastId()).toBe(first.agentId);              // now the benched tail (the grid tiers on RAW state)
        // the display state partitions: an un-wired `off` renders external, never a benched verdict
        expect(agentCards(grid).at(-1).down({ntype: 'fm-state-dot'}).state).toBe('external');

        // ...and the store-bound health bar re-tallied through ITS OWN record seam (no array push)
        expect(swatchOf(bar, 'unobserved').count).toBe(2);
        expect(swatchOf(bar, 'external').count).toBe(1);
        expect(swatchOf(bar, 'off').count).toBe(0);

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
        // the lane renders as an inert text node under `vdom.cn` (a whole short lane), not root `.text`
        expect(card.down({reference: 'card-lane'}).vdom.cn[0].text).toBe('rebuilt on records');
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

        expect(bar.items.length).toBe(7);
        expect(swatchOf(bar, 'unobserved').count).toBe(3);
        expect(swatchOf(bar, 'external').count).toBe(1);   // an un-wired off is outside supervision
        expect(swatchOf(bar, 'off').count).toBe(0);
        expect(swatchOf(bar, 'wedged').count).toBe(0);   // zero still renders (confirms "none")

        // the aggregate verdict rides the bar as the nominal class — nothing here needs an operator
        expect(bar.cls).toContain('fm-health-nominal');
        expect(bar.cls).not.toContain('fm-health-attention');

        // stable instances: capture ids, mutate a RECORD, assert SAME swatch instances re-tallied
        const idsBefore = bar.items.map(sw => sw.id);
        store.items[2].set({state: 'wedged'});                   // idle → wedged, via the record seam
        expect(bar.items.map(sw => sw.id)).toEqual(idsBefore);   // not recreated → the count transition can animate
        expect(swatchOf(bar, 'idle').count).toBe(0);
        // an unwired canonical state stays unobserved in the tally — wedged only counts as session
        // truth under a wired runtime (exactly the card's own honesty rule); the aggregate verdict
        // therefore stays nominal too
        expect(swatchOf(bar, 'wedged').count).toBe(0);
        expect(swatchOf(bar, 'unobserved').count).toBe(3);
        expect(bar.cls).toContain('fm-health-nominal');

        // a store load (roster growth) re-tallies too
        store.add({agentId: 'agent-99', state: 'ok'});
        expect(swatchOf(bar, 'unobserved').count).toBe(4);

        // guest/unknown folds into the VISIBLE external swatch — the seven-swatch bar never
        // undercounts a roster, and never invents a benched verdict for an unsupervised row
        store.items[0].set({state: 'mysterious'});
        expect(bar.items.length).toBe(7);                   // still no 8th swatch
        expect(swatchOf(bar, 'external').count).toBe(2);    // un-wired off + mysterious
        expect(swatchOf(bar, 'off').count).toBe(0);
        expect(swatchOf(bar, 'unobserved').count).toBe(3);

        bar.destroy()
    });

    test('HealthBar animateCounts enforces one class membership without disturbing caller or base classes (#15201)', () => {
        const
            bar      = Neo.create(HealthBar, {animateCounts: false, appName}),
            observed = [];

        bar.addCls('caller-authored');

        const cleanup = bar.observeConfig(bar, 'cls', cls => observed.push([...cls]));

        bar.animateCounts = true;
        bar.animateCounts = true;

        expect(observed).toHaveLength(1);
        expect(observed[0]).toContain('fm-health-bar');
        expect(observed[0]).toContain('caller-authored');
        expect(observed[0].filter(cls => cls === 'fm-animate-counts')).toHaveLength(1);

        bar.animateCounts = false;
        bar.animateCounts = false;

        expect(observed).toHaveLength(2);
        expect(observed[1]).toContain('fm-health-bar');
        expect(observed[1]).toContain('caller-authored');
        expect(observed[1]).not.toContain('fm-animate-counts');

        cleanup();
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

    test('labels the seeded roster honestly — a static-provenance marker until the live source wires', () => {
        const grid = Neo.create(FleetGrid, {appName, adapterState: 'sample', store: makeStore(roster(['ok']))});

        expect(head(grid).cls).toContain('is-sample');
        // provenance only, no offline claim: sample proves WHICH data renders, never WHY — the
        // spine banner owns the why; a badge asserting "offline" against a replying server would
        // repeat the lie the banner used to tell
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-stale')).text).toBe('static roster');
        expect(agentCards(grid).length).toBe(1);

        grid.destroy()
    });

    test('the bootstrap CTA renders ONLY at roster count 0, fires addAgentRequest, and vanishes with the first agent (#15242)', () => {
        const
            fired = [],
            store = makeStore([]),
            grid  = Neo.create(FleetGrid, {appName, store});

        grid.on('addAgentRequest', data => fired.push(data));

        const cta = () => cardsBox(grid).items.find(item => item.cls?.includes('fm-fleet-empty-cta'));

        // empty fleet: the one findable path to the first agent — a native Button, real Tab order
        expect(cta()).toBeTruthy();
        expect(cta().text).toBe('Add your first agent');
        expect(agentCards(grid).length).toBe(0);

        cta().handler();
        expect(fired).toHaveLength(1);

        // the first agent retires the CTA — it is a bootstrap affordance, never ambient chrome
        store.add({agentId: 'first', displayName: 'First', state: 'ok'});
        grid.refreshGrid();

        expect(cta()).toBeUndefined();
        expect(agentCards(grid).length).toBe(1);

        grid.destroy()
    });

});
