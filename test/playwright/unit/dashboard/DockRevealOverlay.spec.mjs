import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRevealOverlayTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import DockRevealOverlay from '../../../../src/dashboard/DockRevealOverlay.mjs';

const createItem = (config={}) => ({
    dockEdge  : 'right',
    dockItemId: 'terminal',
    restorable: true,
    title     : 'Terminal',
    ...config
});

test.describe('Neo.dashboard.DockRevealOverlay', () => {
    let overlay;

    test.afterEach(() => {
        overlay?.destroy();
        overlay = null
    });

    test('stays hidden while idle, renders header + pane slot when revealed', () => {
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

        let [header, paneSlot] = overlay.vdom.cn;

        expect(header.cn[0].text).toBe('Terminal');
        expect(header.cn[1].cls).toContain('neo-dashboard-dock-reveal-pin');
        expect(header.cn[1].disabled).toBeNull();
        expect(paneSlot.id).toBe('dock-reveal-render__pane-slot');
        expect(paneSlot.cls).toContain('neo-dashboard-dock-reveal-pane-slot');
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

    test('renders a disabled pin for a non-pinnable item; intent still routes upstream', () => {
        let pins = [];

        overlay = Neo.create(DockRevealOverlay, {
            edge        : 'right',
            id          : 'dock-reveal-pin-policy',
            revealState : 'revealed',
            revealedItem: createItem({restorable: false})
        });

        overlay.on('revealPinRequested', data => pins.push(data));

        let pin = overlay.vdom.cn[0].cn[1];

        expect(pin.disabled).toBe(true);
        expect(pin.cls).toContain('neo-dashboard-dock-reveal-pin-disabled');

        // Enforcement lives in the rail/model; the overlay only mirrors the affordance.
        overlay.onPinClick({});
        expect(pins).toHaveLength(1);
        expect(pins[0].itemId).toBe('terminal');
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
        overlay.onFocusIn({});
        overlay.onFocusOut({});
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
});
