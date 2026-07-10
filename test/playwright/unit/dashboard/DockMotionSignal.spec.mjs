import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockMotionSignalTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe('Neo.dashboard.DockMotionSignal (the motion-contract observability signal)', () => {
    let DockMotionSignal;

    // Deterministic timer doubles (the DockRevealStateMachine precedent): capture the fail-safe
    // callback instead of scheduling it, fire it by hand.
    const makeTimers = () => {
        const pending = new Map();
        let   nextId  = 1;

        return {
            pending,
            setTimeoutFn  : fn => { const id = nextId++; pending.set(id, fn); return id },
            clearTimeoutFn: id => pending.delete(id),
            fire          : () => { const fns = [...pending.values()]; pending.clear(); fns.forEach(fn => fn()) }
        };
    };

    const makeComponent = id => {
        const calls = [];

        return {
            id,
            isDestroyed: false,
            calls,
            addCls     : cls => calls.push(['add', cls]),
            removeCls  : cls => calls.push(['remove', cls])
        };
    };

    test.beforeAll(async () => {
        DockMotionSignal = (await import('../../../../src/dashboard/DockMotionSignal.mjs')).default
    });

    test.afterEach(() => {
        DockMotionSignal.activeMotions.clear()
    });

    test('the class appears on 0→1 and leaves on 1→0 only — concurrent motions nest', () => {
        const t = makeTimers(),
              c = makeComponent('ws-1');

        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);

        expect(c.calls).toEqual([['add', 'neo-dashboard-dock-animating']]); // added ONCE
        expect(DockMotionSignal.isAnimating('ws-1')).toBe(true);

        DockMotionSignal.leave(c, t.clearTimeoutFn);
        expect(c.calls.length).toBe(1);                                     // still animating: no remove
        expect(DockMotionSignal.isAnimating('ws-1')).toBe(true);

        DockMotionSignal.leave(c, t.clearTimeoutFn);
        expect(c.calls[1]).toEqual(['remove', 'neo-dashboard-dock-animating']);
        expect(DockMotionSignal.isAnimating('ws-1')).toBe(false)
    });

    test('the fail-safe force-clears a wedged motion — a lost leave never wedges the signal', () => {
        const t = makeTimers(),
              c = makeComponent('ws-2');

        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        expect(DockMotionSignal.isAnimating('ws-2')).toBe(true);

        t.fire(); // the producer lost its leave — the backstop fires

        expect(DockMotionSignal.isAnimating('ws-2')).toBe(false);
        expect(c.calls[1]).toEqual(['remove', 'neo-dashboard-dock-animating']);

        // the signal is REUSABLE after a force-clear: state fully cleaned
        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        expect(DockMotionSignal.isAnimating('ws-2')).toBe(true);
        expect(c.calls[2]).toEqual(['add', 'neo-dashboard-dock-animating'])
    });

    test('every new enter re-arms the fail-safe — the backstop covers the LAST starter', () => {
        const t = makeTimers(),
              c = makeComponent('ws-3');

        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);

        // the first timer was cleared by the second enter: exactly ONE pending backstop
        expect(t.pending.size).toBe(1)
    });

    test('destroyed components are no-ops in both directions, including inside the fail-safe', () => {
        const t = makeTimers(),
              c = makeComponent('ws-4');

        c.isDestroyed = true;
        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        expect(c.calls).toEqual([]);
        expect(DockMotionSignal.isAnimating('ws-4')).toBe(false);

        // live enter, THEN mid-flight destroy, then the backstop fires: bookkeeping clears,
        // but the destroyed instance is never touched (the DOM-corpse defect family)
        const d = makeComponent('ws-5');
        DockMotionSignal.enter(d, t.setTimeoutFn, t.clearTimeoutFn);
        d.isDestroyed = true;
        t.fire();

        expect(DockMotionSignal.isAnimating('ws-5')).toBe(false);
        expect(d.calls).toEqual([['add', 'neo-dashboard-dock-animating']]) // no remove on a corpse
    });

    test('unbalanced leaves are safe no-ops — teardown paths may call unconditionally', () => {
        const t = makeTimers(),
              c = makeComponent('ws-6');

        DockMotionSignal.leave(c, t.clearTimeoutFn);          // never entered
        expect(c.calls).toEqual([]);

        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        t.fire();                                             // fail-safe already cleared
        DockMotionSignal.leave(c, t.clearTimeoutFn);          // late leave after force-clear

        expect(c.calls.filter(([kind]) => kind === 'remove').length).toBe(1) // exactly one remove
    });

    test('mid-flight destroy plus a producer leave stays corpse-safe', () => {
        const t = makeTimers(),
              c = makeComponent('ws-7');

        DockMotionSignal.enter(c, t.setTimeoutFn, t.clearTimeoutFn);
        c.isDestroyed = true;
        DockMotionSignal.leave(c, t.clearTimeoutFn);

        expect(DockMotionSignal.isAnimating('ws-7')).toBe(false);
        expect(c.calls).toEqual([['add', 'neo-dashboard-dock-animating']]) // bookkeeping cleared, corpse untouched
    });
});
