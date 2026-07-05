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

test.describe('Fleet cockpit FleetGrid + HealthBar — density-ranked grid (#14599)', () => {
    let FleetGrid, HealthBar, rankFleet, healthCounts;

    // a roster from a list of states; agentIds are shuffled-stable so the sort is provable
    const roster = states => states.map((state, i) => ({
        agentId    : `agent-${String((states.length - i)).padStart(2, '0')}`,
        displayName: `Agent ${i}`,
        state
    }));

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
        healthCounts = barMod.healthCounts
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

    test('below threshold the grid renders every card in ranked order — no fold', () => {
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 12, agents: roster(['ok', 'idle', 'off', 'ok', 'idle', 'wedged'])});

        expect(agentCards(grid).length).toBe(6);   // all six render
        expect(foldRow(grid)).toBeFalsy();          // nothing collapsed
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-title')).text).toBe('Fleet · 6 agents');

        grid.destroy()
    });

    test('at/over threshold the idle tier collapses to an honest count — online + benched stay as cards', () => {
        // 4 online · 6 idle · 2 benched = 12 → folded
        const grid = Neo.create(FleetGrid, {appName, foldThreshold: 12, agents: roster([
            'ok', 'ok', 'limited', 'wedged',
            'idle', 'idle', 'idle', 'idle', 'idle', 'idle',
            'off', 'off'
        ])});

        // online (4) + benched (2) render as cards; the six idle do NOT
        expect(agentCards(grid).length).toBe(6);
        // the fold surfaces the folded idle count — never a silent drop
        expect(foldRow(grid)).toBeTruthy();
        expect(foldRow(grid).text).toBe('6 idle');

        grid.destroy()
    });

    test('HealthBar renders the five swatches and updates counts IN PLACE across roster changes (no rebuild)', () => {
        const bar = Neo.create(HealthBar, {appName, agents: roster(['ok', 'ok', 'idle', 'off'])});

        expect(bar.items.length).toBe(5);
        expect(swatchOf(bar, 'ok').count).toBe(2);
        expect(swatchOf(bar, 'idle').count).toBe(1);
        expect(swatchOf(bar, 'off').count).toBe(1);
        expect(swatchOf(bar, 'wedged').count).toBe(0);   // zero still renders (confirms "none")

        // stable instances: capture ids, change the roster, assert SAME swatch instances updated
        const idsBefore = bar.items.map(sw => sw.id);
        bar.agents = roster(['ok', 'ok', 'ok', 'wedged', 'wedged']);
        expect(bar.items.map(sw => sw.id)).toEqual(idsBefore);   // not recreated → the count transition can animate
        expect(swatchOf(bar, 'ok').count).toBe(3);
        expect(swatchOf(bar, 'wedged').count).toBe(2);
        expect(swatchOf(bar, 'idle').count).toBe(0);

        // guest/unknown folds into the VISIBLE off swatch — the five-swatch bar never undercounts a roster
        bar.agents = roster(['ok', 'guest', 'mysterious']);
        expect(bar.items.length).toBe(5);              // still no 6th swatch
        expect(swatchOf(bar, 'off').count).toBe(2);    // guest + mysterious rendered as benched
        expect(swatchOf(bar, 'ok').count).toBe(1);

        bar.destroy()
    });

    test('degrades honestly on adapter loss — a stale header, never a blanked grid', () => {
        const grid = Neo.create(FleetGrid, {appName, adapterState: 'stale', agents: roster(['ok', 'idle', 'off'])});

        expect(head(grid).cls).toContain('is-stale');
        expect(head(grid).items.find(i => i.cls.includes('fm-fleet-stale')).text).toBe('stale — reconnecting');
        // the cards still render — degrade surfaces the state, it does not blank the grid
        expect(agentCards(grid).length).toBe(3);

        grid.destroy()
    });
});
