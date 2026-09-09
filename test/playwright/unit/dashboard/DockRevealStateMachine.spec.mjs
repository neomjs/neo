import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockRevealStateMachineTest'}});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../src/Neo.mjs';
import * as core              from '../../../../src/core/_export.mjs';
import DockRevealStateMachine from '../../../../src/dashboard/dock/interaction/RevealStateMachine.mjs';
import {execFileSync}         from 'node:child_process';
import {fileURLToPath}        from 'node:url';

/** @summary Controls native timer delivery while the real Base timeout owns registration and cleanup. */
const createFakeTimers = () => {
    const nativeSet = globalThis.setTimeout, nativeClear = globalThis.clearTimeout;
    let   nextId    = 1, now = 0;
    const queue     = new Map(), timers = {
        async advance(ms) {
            now += ms;
            [...queue.entries()].sort((a, b) => a[1].at - b[1].at).forEach(([id, timer]) => {
                if (timer.at <= now && queue.has(id)) {
                    queue.delete(id);
                    timer.fn()
                }
            })
        },
        pendingCount: () => queue.size,
        restore() {
            globalThis.setTimeout = nativeSet;
            globalThis.clearTimeout = nativeClear
        }
    };
    globalThis.setTimeout = (fn, ms) => {
        const id = nextId++;
        queue.set(id, {at: now + ms, fn});
        return id
    };
    globalThis.clearTimeout = id => queue.delete(id);
    return timers
};

let activeTimers = null;

const machines = new Set();

const createMachine = (config={}) => {
    let changes = [],
        timers  = activeTimers ??= createFakeTimers(),
        machine = Neo.create(DockRevealStateMachine, {
            onChange      : (next, previous) => changes.push({next, previous}),
            ...config
        });

    machines.add(machine);
    return {changes, machine, timers}
};

test.describe('DockRevealStateMachine', async () => {
    test.afterEach(() => {
        machines.forEach(machine => machine.destroy());
        machines.clear();
        activeTimers?.restore();
        activeTimers = null
    });

    test('a pre-import Neo overwrite reaches a real Rail input and its owned lifecycle', async () => {
        const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
            await import('./src/Neo.mjs');
            await import('./src/core/_export.mjs');
            const {setup} = await import('./test/playwright/setup.mjs');
            setup({appConfig: {name: 'DockRevealOverwriteTest'}});
            Neo.overwrites = {};
            const policy = Neo.ns('Neo.dashboard.dock.interaction.RevealStateMachine', true, Neo.overwrites);
            policy.dwellMs_ = 75;
            policy.tabClick = function(itemId) {
                this.transition('revealed', itemId);
            };
            const {default: Rail} = await import('./src/dashboard/dock/interaction/Rail.mjs');
            const {default: Machine} = await import('./src/dashboard/dock/interaction/RevealStateMachine.mjs');
            const rail = Neo.create(Rail, {edge: 'right', railItems: [{dockItemId: 'terminal', title: 'Terminal', restorable: true}]});
            const machine = rail.revealMachine;
            const dwellMs = machine.dwellMs;
            const snapshot = rail.onTabClick({component: {dockItemId: 'terminal'}});
            rail.destroy();
            process.stdout.write(JSON.stringify({
                registered: Machine === Neo.dashboard.dock.interaction.RevealStateMachine,
                snapshot, dwellMs, destroyed: machine.isDestroyed === true
            }));
        `], {cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8'}));

        expect(result.registered).toBe(true);
        expect(result.snapshot).toEqual({revealedItemId: 'terminal', state: 'revealed'});
        expect(result.dwellMs).toBe(75);
        expect(result.destroyed).toBe(true)
    });

    test('explicit dwell and grace durations govern their respective transitions', async () => {
        const {machine, timers} = createMachine({dwellMs: 12, graceMs: 23, revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(11);
        expect(machine.state).toBe('dwell-pending');
        await timers.advance(1);
        expect(machine.state).toBe('revealed');
        machine.overlayPointerLeave();
        await timers.advance(22);
        expect(machine.state).toBe('dismiss-pending');
        await timers.advance(1);
        expect(machine.state).toBe('idle')
    });

    test('invalid optional timings retain defaults and hover requires true', async () => {
        const {machine} = createMachine({dwellMs: NaN, graceMs: Infinity, revealOnHover: 'true'});

        expect(machine.dwellMs).toBe(150);
        expect(machine.graceMs).toBe(300);
        expect(machine.revealOnHover).toBe(false)
    });

    test('inherited policy defaults use the same validation as explicit configs', async () => {
        class InvalidPolicy extends DockRevealStateMachine {
            static config = {
                className    : 'Test.Unit.Dashboard.Reveal.InvalidPolicyDefaults',
                dwellMs      : NaN,
                graceMs      : Infinity,
                revealOnHover: 'true'
            }
        }
        const machine = Neo.create(Neo.setupClass(InvalidPolicy));
        machines.add(machine);
        expect(machine.dwellMs).toBe(150);
        expect(machine.graceMs).toBe(300);
        expect(machine.revealOnHover).toBe(false)
    });

    test('invalid input preserves valid subclass timing defaults and ignores invalid callbacks', async () => {
        class CustomPolicy extends DockRevealStateMachine {
            static config = {
                className: 'Test.Unit.Dashboard.Reveal.CustomPolicyDefaults',
                dwellMs  : 12,
                graceMs  : 23
            }
        }
        const machine = Neo.create(Neo.setupClass(CustomPolicy), {
            dwellMs: NaN, graceMs: Infinity, onChange: 'not a callback'
        });
        machines.add(machine);
        expect([machine.dwellMs, machine.graceMs, machine.onChange]).toEqual([12, 23, null]);
        machine.set({dwellMs: NaN, graceMs: Infinity});
        expect([machine.dwellMs, machine.graceMs]).toEqual([12, 23])
    });

    for (const state of ['dwell-pending', 'dismiss-pending']) {
        test(`destruction from ${state} notification schedules no later work`, async () => {
            const set = globalThis.setTimeout, clear = globalThis.clearTimeout, pending = new Map();
            let   id  = 0, machine;
            globalThis.setTimeout = (fn, ms) => { pending.set(++id, {fn, ms}); return id };
            globalThis.clearTimeout = key => pending.delete(key);
            try {
                machine = Neo.create(DockRevealStateMachine, {
                    revealOnHover: true,
                    onChange     : next => { if (next.state === state) machine.destroy() }
                });
                await machine.ready();
                if (state === 'dwell-pending') machine.tabHoverIn('terminal');
                else {
                    machine.transition('revealed', 'terminal');
                    machine.overlayPointerLeave()
                }
                expect(machine.isDestroyed).toBe(true);
                expect(pending.size).toBe(0);
                expect(Object.hasOwn(machine, 'timerId')).toBe(false)
            } finally {
                machine?.destroy();
                globalThis.setTimeout = set;
                globalThis.clearTimeout = clear
            }
        })
    }

    test('click-reveal is the default: click focuses, re-click dismisses', async () => {
        let {changes, machine} = createMachine();

        machine.tabClick('terminal');

        expect(machine.state).toBe('revealed-focused');
        expect(machine.revealedItemId).toBe('terminal');

        machine.tabClick('terminal');

        expect(machine.state).toBe('idle');
        expect(machine.revealedItemId).toBeNull();
        expect(changes.map(change => change.next.state)).toEqual(['revealed-focused', 'idle']);
    });

    test('hover input is ignored without the workspace opt-in (a11y default)', async () => {
        let {machine, timers} = createMachine();

        machine.tabHoverIn('terminal');

        expect(machine.state).toBe('idle');
        expect(timers.pendingCount()).toBe(0);
    });

    test('opt-in hover reveals after the dwell, without stealing focus', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');

        expect(machine.state).toBe('dwell-pending');

        await timers.advance(DockRevealStateMachine.DWELL_MS - 1);
        expect(machine.state).toBe('dwell-pending');

        await timers.advance(1);
        expect(machine.state).toBe('revealed');
        expect(machine.revealedItemId).toBe('terminal');
    });

    test('a pass-through hover never flickers an overlay open', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        machine.tabHoverOut();

        expect(machine.state).toBe('idle');

        await timers.advance(DockRevealStateMachine.DWELL_MS * 2);
        expect(machine.state).toBe('idle');
    });

    test('pointer-away dismisses an unfocused reveal only after the grace period', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();

        expect(machine.state).toBe('dismiss-pending');

        await timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS - 1);
        expect(machine.state).toBe('dismiss-pending');

        await timers.advance(1);
        expect(machine.state).toBe('idle');
    });

    test('a grace-window pointer return keeps the overlay open', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();
        machine.overlayPointerEnter();

        expect(machine.state).toBe('revealed');

        await timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 2);
        expect(machine.state).toBe('revealed');
    });

    test('focus-hold: a focused reveal never auto-dismisses; focus leave dismisses', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayFocusEnter();

        expect(machine.state).toBe('revealed-focused');

        machine.overlayPointerLeave();
        expect(machine.state).toBe('revealed-focused');

        await timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 10);
        expect(machine.state).toBe('revealed-focused');

        machine.overlayFocusLeave();
        expect(machine.state).toBe('idle');
    });

    test('focus entering during the grace window rescues the reveal into focus-hold', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();
        machine.overlayFocusEnter();

        expect(machine.state).toBe('revealed-focused');

        await timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 2);
        expect(machine.state).toBe('revealed-focused');
    });

    test('escape and outside-click dismiss from every revealed state', async () => {
        let {machine} = createMachine();

        machine.tabClick('terminal');
        machine.escape();
        expect(machine.state).toBe('idle');

        machine.tabClick('terminal');
        machine.outsideClick();
        expect(machine.state).toBe('idle');
    });

    test('click retargets an open reveal to the other item', async () => {
        let {machine} = createMachine();

        machine.tabClick('terminal');
        machine.tabClick('inspector');

        expect(machine.state).toBe('revealed-focused');
        expect(machine.revealedItemId).toBe('inspector');
    });

    test('hover retarget re-dwells while the current reveal survives until commit', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.revealedItemId).toBe('terminal');

        machine.tabHoverIn('inspector');
        expect(machine.state).toBe('dwell-pending');
        expect(machine.revealedItemId).toBe('terminal');

        await timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.state).toBe('revealed');
        expect(machine.revealedItemId).toBe('inspector');
    });

    test('a hover-born reveal dismisses through grace when the pointer leaves the tab without entering the overlay', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        await timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.state).toBe('revealed');

        machine.tabHoverOut();
        expect(machine.state).toBe('dismiss-pending');

        // Reaching the overlay during grace rescues the reveal...
        machine.overlayPointerEnter();
        expect(machine.state).toBe('revealed');

        // ...while never reaching it lets the grace dismiss.
        machine.tabHoverOut();
        await timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS);
        expect(machine.state).toBe('idle');
    });

    test('itemCleared fail-closes any reveal or pending dwell of that item', async () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabClick('terminal');
        machine.itemCleared('inspector');
        expect(machine.state).toBe('revealed-focused');

        machine.itemCleared('terminal');
        expect(machine.state).toBe('idle');

        machine.tabHoverIn('inspector');
        machine.itemCleared('inspector');
        expect(machine.state).toBe('idle');

        await timers.advance(DockRevealStateMachine.DWELL_MS * 2);
        expect(machine.state).toBe('idle');
    });

    test('destroy clears pending timers and detaches the change listener', async () => {
        let {changes, machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        machine.destroy();

        await timers.advance(DockRevealStateMachine.DWELL_MS * 2);

        expect(timers.pendingCount()).toBe(0);
        expect(changes.map(change => change.next.state)).toEqual(['dwell-pending']);
    });

    test('repeated retargets retain one native timer through the actual Base registration path', async () => {
        const {machine, timers} = createMachine({revealOnHover: true}),
              active            = new Set(), register = machine.registerAsync.bind(machine),
              unregister        = machine.unregisterAsync.bind(machine);
        let registrations = 0;
        machine.registerAsync = (id, reject) => { registrations++; active.add(id); register(id, reject) };
        machine.unregisterAsync = id => { active.delete(id); unregister(id) };

        for (let i = 0; i < 100; i++) {
            machine.tabHoverIn(`item-${i}`);
            expect(timers.pendingCount()).toBe(1);
            expect(active.size).toBe(1)
        }
        expect(registrations).toBe(100);
        machine.destroy();
        expect(timers.pendingCount()).toBe(0);
        expect(active.size).toBe(0)
    });

    test('control: bypassing Base wait ownership is visible as obsolete native timers', async () => {
        const {machine, timers} = createMachine({revealOnHover: true});
        machine.timeout = ms => new Promise(resolve => setTimeout(resolve, ms));
        machine.tabHoverIn('first');
        machine.tabHoverIn('second');
        expect(timers.pendingCount()).toBe(2);
        machine.destroy();
        expect(timers.pendingCount()).toBe(2);
        await timers.advance(300);
        expect(Object.hasOwn(machine, 'state')).toBe(false)
    });

    test('a fulfilled dwell cannot publish after another intent wins the microtask gap', async () => {
        const {machine, timers, changes} = createMachine({revealOnHover: true});
        machine.tabHoverIn('first');
        const elapsed = timers.advance(150);
        machine.tabHoverIn('second');
        await elapsed;
        expect(machine.state).toBe('dwell-pending');
        expect(machine.revealedItemId).toBeNull();
        expect(timers.pendingCount()).toBe(1);
        await timers.advance(150);
        expect(machine.revealedItemId).toBe('second');
        expect(changes.filter(change => change.next.state === 'revealed').map(change => change.next.revealedItemId))
            .toEqual(['second'])
    });

    test('a reentrant restart to the same pending state schedules only the newer intent', async () => {
        const {machine, timers} = createMachine({revealOnHover: true});
        let   restart           = true;
        machine.onChange = next => {
            if (next.state === 'dwell-pending' && restart) {
                restart = false;
                machine.escape();
                machine.tabHoverIn('same')
            }
        };
        machine.tabHoverIn('same');
        expect(timers.pendingCount()).toBe(1);
        await timers.advance(150);
        expect(machine.state).toBe('revealed');
        expect(machine.revealedItemId).toBe('same')
    });

    test('live policy validates through hooks and applies to the next wait', async () => {
        const {machine, timers} = createMachine({revealOnHover: true, dwellMs: 12, graceMs: 23});
        machine.tabHoverIn('first');
        machine.set({dwellMs: 5, graceMs: 7});
        await timers.advance(11);
        expect(machine.state).toBe('dwell-pending');
        await timers.advance(1);
        expect(machine.state).toBe('revealed');
        machine.tabHoverIn('second');
        await timers.advance(4);
        expect(machine.revealedItemId).toBe('first');
        await timers.advance(1);
        expect(machine.revealedItemId).toBe('second');
        machine.set({dwellMs: NaN, graceMs: Infinity, revealOnHover: 'true'});
        expect([machine.dwellMs, machine.graceMs, machine.revealOnHover]).toEqual([5, 7, false]);
        machine.overlayPointerLeave();
        await timers.advance(7);
        expect(machine.state).toBe('idle');
        machine.tabHoverIn('third');
        expect(timers.pendingCount()).toBe(0)
    });
});
