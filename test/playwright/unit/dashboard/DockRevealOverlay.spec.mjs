import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRevealOverlayTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockMotionSignal  from '../../../../src/dashboard/dock/projection/MotionSignal.mjs';
import DockRevealOverlay from '../../../../src/dashboard/dock/interaction/RevealOverlay.mjs';

const createItem = (config={}) => ({
    dockEdge  : 'right',
    dockItemId: 'terminal',
    restorable: true,
    title     : 'Terminal',
    ...config
});

/**
 * @summary Builds the local `DomEvents` wire shape for an `animationend`; native
 * `AnimationEvent.animationName` is deliberately absent from the serialized payload.
 * @param {String} targetId Config-aware browser target id.
 * @param {String[]} [pathIds] Serialized composed-path ids.
 * @param {String} [rawId] Raw DOM id retained by the local-listener envelope.
 * @returns {Object}
 */
const createSerializedAnimationEnd = (targetId, pathIds=[targetId], rawId=targetId) => ({
    id       : rawId,
    path     : pathIds.map(id => ({id})),
    target   : {id: targetId},
    timeStamp: 1,
    type     : 'animationend',
    value    : undefined
});

test.describe('Neo.dashboard.dock.interaction.RevealOverlay', () => {
    let overlay;

    test.afterEach(() => {
        overlay?.destroy();
        overlay = null;
        DockMotionSignal.activeMotions.clear()
    });

    test('stays hidden while idle, composes header (label + pin) and pane slot as real children', () => {
        overlay = Neo.create(DockRevealOverlay, {
            edge: 'right',
            id  : 'dock-reveal-render'
        });

        expect(overlay.visible).toBe(false);
        expect(overlay.cls).toContain('neo-dashboard-dock-reveal-overlay-hidden');
        expect(overlay.cls).toContain('neo-dashboard-dock-reveal-overlay-right');

        overlay.set({revealState: 'revealed', revealedItem: createItem()});

        expect(overlay.visible).toBe(true);
        expect(overlay.cls).not.toContain('neo-dashboard-dock-reveal-overlay-hidden');

        // Real composed children, not synthesized vdom.
        expect(overlay.titleLabel.text).toBe('Terminal');
        expect(overlay.pinButton.disabled).toBe(false);
        expect(overlay.items[0].className).toBe('Neo.tab.header.Toolbar');
        expect(overlay.items[0].cls).toContain('neo-tab-header-toolbar');
        expect(overlay.pinButton.cls).toContain('neo-dashboard-dock-reveal-pin');
        expect(overlay.pinButton.cls).toContain('neo-toolbar-action');
        expect(overlay.pinButton.isToolbarAction, 'the preview uses the real tab-header action primitive').toBe(true);
        expect(overlay.pinButton.showOnFocus, 'the revealed inverse stays persistently available').toBe(false);
        expect(overlay.pinButton.ui, 'tab-header CSS, not a standalone Button ui, owns its chrome').toBeNull();
        expect(overlay.pinButton.iconCls).toBe('fa fa-thumbtack');
        expect(overlay.pinButton.text, 'pane chrome uses a compact icon control').toBeNull();
        expect(overlay.pinButton.vdom['aria-label']).toBe('Pin');
        expect(overlay.paneSlot.cls).toContain('neo-dashboard-dock-reveal-pane-slot');
        expect(overlay.paneSlot.items).toHaveLength(0);
    });

    test('remains visible through the dismiss grace window', () => {
        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'left',
            id          : 'dock-reveal-grace',
            revealState : 'dismiss-pending',
            revealedItem: createItem()
        });

        expect(overlay.visible).toBe(true);
    });

    test('sizes the free dimension from the committed extent, else the default fraction', () => {
        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'left',
            id          : 'dock-reveal-sizing',
            revealExtent: 0.3,
            revealState : 'revealed',
            revealedItem: createItem({dockEdge: 'left'})
        });

        expect(overlay.style.width).toBe('30%');
        expect(overlay.style.height).toBeNull();

        overlay.revealExtent = null;
        expect(overlay.style.width).toBe('25%');

        overlay.set({defaultRevealFraction: 0.4, edge: 'top'});
        expect(overlay.style.height).toBe('40%');
        expect(overlay.style.width).toBeNull();
    });

    test('the pin button mirrors policy: disabled for a non-pinnable item, intent still routes upstream', () => {
        let pins = [];

        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'right',
            id          : 'dock-reveal-pin-policy',
            revealState : 'revealed',
            revealedItem: createItem({restorable: false})
        });

        overlay.on('revealPinRequested', data => pins.push(data));

        expect(overlay.pinButton.disabled).toBe(true);

        // Enforcement lives in the rail/model; the overlay only mirrors the affordance.
        overlay.onPinClick({});
        expect(pins).toHaveLength(1);
        expect(pins[0].itemId).toBe('terminal');

        // A live policy flip re-enables the SAME pin button instance.
        let pinButton = overlay.pinButton;

        overlay.revealedItem = createItem({restorable: true});

        expect(overlay.pinButton).toBe(pinButton);
        expect(pinButton.disabled).toBe(false);
    });

    test('translates DOM reality into semantic intents (pointer, focus, escape, pin)', () => {
        let fired = [];

        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'right',
            id          : 'dock-reveal-intents',
            revealState : 'revealed',
            revealedItem: createItem()
        });

        ['revealEscape', 'revealFocusEnter', 'revealFocusLeave', 'revealPinRequested', 'revealPointerEnter', 'revealPointerLeave']
            .forEach(name => overlay.on(name, () => fired.push(name)));

        overlay.onPointerEnter({});
        overlay.onPointerLeave({});
        overlay.onFocusEnter({});
        overlay.onFocusLeave({});
        overlay.onKeyDown({key: 'Escape'});
        overlay.onKeyDown({key: 'Enter'});
        overlay.onPinClick({});

        expect(fired).toEqual([
            'revealPointerEnter',
            'revealPointerLeave',
            'revealFocusEnter',
            'revealFocusLeave',
            'revealEscape',
            'revealPinRequested'
        ]);
    });

    test('inside mousedown focuses the programmatic root through the global listener', () => {
        const focused = [];

        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'right',
            id          : 'dock-reveal-inside-focus',
            revealState : 'revealed-focused',
            revealedItem: createItem()
        });

        overlay.focus = (...args) => focused.push(args);

        expect(overlay.vdom.tabIndex).toBe(-1);
        expect(overlay.domListeners.some(listener => typeof listener.mousedown === 'function')).toBe(true);

        overlay.onMouseDown({});

        expect(focused).toEqual([[overlay.id, false, true, 'pointer']])
    });

    test('the reveal-slide routes the motion signal: enter on hidden→visible, filtered leave on animationend', () => {
        overlay = Neo.create(DockRevealOverlay, {
            edge: 'left',
            id  : 'dock-reveal-motion'
        });

        const rootId = overlay.vdom?.id || overlay.id;

        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);

        // idle → revealed opens the signal window (the CSS keyframes restart natively:
        // the hidden state is display:none)
        overlay.set({revealState: 'revealed', revealedItem: createItem()});
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(true);

        // A hosted pane's bubbled animation keeps its child target id and must NOT close the
        // overlay-owned window, even though the serialized path reaches the overlay root.
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd('hosted-pane-animation', ['hosted-pane-animation', rootId]));
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(true);

        // Raw DOM ids are a different identity namespace. A non-Neo child can omit the
        // config-aware target id while its browser id happens to collide with the overlay id;
        // that must not settle the overlay-owned motion window.
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd(undefined, [rootId], rootId));
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(true);

        // The overlay root event settles. A blank raw DOM id models `useDomIds:false`; the
        // config-aware `target.id` remains the portable identity authority.
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd(rootId, [rootId], ''));
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);

        // dismiss is an instant display cut: no motion window opens
        overlay.set({revealState: 'idle', revealedItem: null});
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);

        // visible→visible state shifts (revealed → dismiss-pending) never double-enter
        overlay.set({revealState: 'revealed', revealedItem: createItem()});
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd(rootId));
        overlay.set({revealState: 'dismiss-pending'});
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false)
    });

    test('early dismissal, rapid re-reveal and destroy each settle exactly their owned motion entry', () => {
        overlay = Neo.create(DockRevealOverlay, {
            edge: 'left',
            id  : 'dock-reveal-motion-cancel'
        });

        overlay.set({revealState: 'revealed', revealedItem: createItem()});
        expect(DockMotionSignal.activeMotions.get(overlay)?.count).toBe(1);

        // display:none cancels the CSS animation without animationend. The state transition
        // settles synchronously instead of leaving the signal wedged until its fail-safe.
        overlay.set({revealState: 'idle', revealedItem: null});
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);
        expect(DockMotionSignal.activeMotions.has(overlay)).toBe(false);

        // A quick second reveal starts from a clean count; its one end event fully settles it.
        overlay.set({revealState: 'revealed', revealedItem: createItem()});
        expect(DockMotionSignal.activeMotions.get(overlay)?.count).toBe(1);
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd(overlay.vdom?.id || overlay.id));
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);

        // Item-only visibility shifts follow the same balanced lifecycle while the state remains
        // `revealed`: removing the item hides/cancels; restoring one restarts from count one.
        overlay.set({revealState: 'idle', revealedItem: null});
        overlay.set({revealState: 'revealed', revealedItem: createItem()});
        overlay.revealedItem = null;
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);
        overlay.revealedItem = createItem();
        expect(DockMotionSignal.activeMotions.get(overlay)?.count).toBe(1);
        overlay.onMotionAnimationEnd(createSerializedAnimationEnd(overlay.vdom?.id || overlay.id));
        expect(DockMotionSignal.isAnimating(overlay.id)).toBe(false);

        // Teardown is another animation-cancellation path and must release instance ownership.
        overlay.set({revealState: 'idle', revealedItem: null});
        overlay.set({revealState: 'revealed', revealedItem: createItem()});

        let doomed = overlay;

        overlay.destroy();
        overlay = null;

        expect(DockMotionSignal.activeMotions.has(doomed)).toBe(false)
    });
});
