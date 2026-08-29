import {test, expect}         from '@playwright/test';
import DockRevealStateMachine from '../../../../src/dashboard/dock/interaction/RevealStateMachine.mjs';

const createFakeTimers = () => {
    let nextId = 1,
        now    = 0,
        queue  = new Map();

    return {
        advance(ms) {
            now += ms;

            [...queue.entries()]
                .sort((a, b) => a[1].at - b[1].at)
                .forEach(([id, timer]) => {
                    if (timer.at <= now && queue.has(id)) {
                        queue.delete(id);
                        timer.fn()
                    }
                })
        },
        clearTimeoutFn(id) {
            queue.delete(id)
        },
        pendingCount() {
            return queue.size
        },
        setTimeoutFn(fn, ms) {
            let id = nextId++;
            queue.set(id, {at: now + ms, fn});
            return id
        }
    }
};

const createMachine = (config={}) => {
    let changes = [],
        timers  = createFakeTimers(),
        machine = new DockRevealStateMachine({
            clearTimeoutFn: timers.clearTimeoutFn.bind(timers),
            onChange      : (next, previous) => changes.push({next, previous}),
            setTimeoutFn  : timers.setTimeoutFn.bind(timers),
            ...config
        });

    return {changes, machine, timers}
};

test.describe('DockRevealStateMachine', () => {
    test('click-reveal is the default: click focuses, re-click dismisses', () => {
        let {changes, machine} = createMachine();

        machine.tabClick('terminal');

        expect(machine.state).toBe('revealed-focused');
        expect(machine.revealedItemId).toBe('terminal');

        machine.tabClick('terminal');

        expect(machine.state).toBe('idle');
        expect(machine.revealedItemId).toBeNull();
        expect(changes.map(change => change.next.state)).toEqual(['revealed-focused', 'idle']);
    });

    test('hover input is ignored without the workspace opt-in (a11y default)', () => {
        let {machine, timers} = createMachine();

        machine.tabHoverIn('terminal');

        expect(machine.state).toBe('idle');
        expect(timers.pendingCount()).toBe(0);
    });

    test('opt-in hover reveals after the dwell, without stealing focus', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');

        expect(machine.state).toBe('dwell-pending');

        timers.advance(DockRevealStateMachine.DWELL_MS - 1);
        expect(machine.state).toBe('dwell-pending');

        timers.advance(1);
        expect(machine.state).toBe('revealed');
        expect(machine.revealedItemId).toBe('terminal');
    });

    test('a pass-through hover never flickers an overlay open', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        machine.tabHoverOut();

        expect(machine.state).toBe('idle');

        timers.advance(DockRevealStateMachine.DWELL_MS * 2);
        expect(machine.state).toBe('idle');
    });

    test('pointer-away dismisses an unfocused reveal only after the grace period', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();

        expect(machine.state).toBe('dismiss-pending');

        timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS - 1);
        expect(machine.state).toBe('dismiss-pending');

        timers.advance(1);
        expect(machine.state).toBe('idle');
    });

    test('a grace-window pointer return keeps the overlay open', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();
        machine.overlayPointerEnter();

        expect(machine.state).toBe('revealed');

        timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 2);
        expect(machine.state).toBe('revealed');
    });

    test('focus-hold: a focused reveal never auto-dismisses; focus leave dismisses', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayFocusEnter();

        expect(machine.state).toBe('revealed-focused');

        machine.overlayPointerLeave();
        expect(machine.state).toBe('revealed-focused');

        timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 10);
        expect(machine.state).toBe('revealed-focused');

        machine.overlayFocusLeave();
        expect(machine.state).toBe('idle');
    });

    test('focus entering during the grace window rescues the reveal into focus-hold', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        machine.overlayPointerLeave();
        machine.overlayFocusEnter();

        expect(machine.state).toBe('revealed-focused');

        timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS * 2);
        expect(machine.state).toBe('revealed-focused');
    });

    test('escape and outside-click dismiss from every revealed state', () => {
        let {machine} = createMachine();

        machine.tabClick('terminal');
        machine.escape();
        expect(machine.state).toBe('idle');

        machine.tabClick('terminal');
        machine.outsideClick();
        expect(machine.state).toBe('idle');
    });

    test('click retargets an open reveal to the other item', () => {
        let {machine} = createMachine();

        machine.tabClick('terminal');
        machine.tabClick('inspector');

        expect(machine.state).toBe('revealed-focused');
        expect(machine.revealedItemId).toBe('inspector');
    });

    test('hover retarget re-dwells while the current reveal survives until commit', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.revealedItemId).toBe('terminal');

        machine.tabHoverIn('inspector');
        expect(machine.state).toBe('dwell-pending');
        expect(machine.revealedItemId).toBe('terminal');

        timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.state).toBe('revealed');
        expect(machine.revealedItemId).toBe('inspector');
    });

    test('a hover-born reveal dismisses through grace when the pointer leaves the tab without entering the overlay', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        timers.advance(DockRevealStateMachine.DWELL_MS);
        expect(machine.state).toBe('revealed');

        machine.tabHoverOut();
        expect(machine.state).toBe('dismiss-pending');

        // Reaching the overlay during grace rescues the reveal...
        machine.overlayPointerEnter();
        expect(machine.state).toBe('revealed');

        // ...while never reaching it lets the grace dismiss.
        machine.tabHoverOut();
        timers.advance(DockRevealStateMachine.DISMISS_GRACE_MS);
        expect(machine.state).toBe('idle');
    });

    test('itemCleared fail-closes any reveal or pending dwell of that item', () => {
        let {machine, timers} = createMachine({revealOnHover: true});

        machine.tabClick('terminal');
        machine.itemCleared('inspector');
        expect(machine.state).toBe('revealed-focused');

        machine.itemCleared('terminal');
        expect(machine.state).toBe('idle');

        machine.tabHoverIn('inspector');
        machine.itemCleared('inspector');
        expect(machine.state).toBe('idle');

        timers.advance(DockRevealStateMachine.DWELL_MS * 2);
        expect(machine.state).toBe('idle');
    });

    test('destroy clears pending timers and detaches the change listener', () => {
        let {changes, machine, timers} = createMachine({revealOnHover: true});

        machine.tabHoverIn('terminal');
        machine.destroy();

        timers.advance(DockRevealStateMachine.DWELL_MS * 2);

        expect(timers.pendingCount()).toBe(0);
        expect(changes.map(change => change.next.state)).toEqual(['dwell-pending']);
    });
});
