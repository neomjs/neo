import {setup} from '../../setup.mjs';

const appName = 'ToolbarActionButtonTest';

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
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ActionButton   from '../../../../src/toolbar/ActionButton.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';

/**
 * The action derives its own presentation from one flag, so the mapping lives in exactly one place
 * and cannot disagree with itself between the config that built it and the sync that follows.
 */
// `tooltip_` normalises a string into `{text}`, so the assertions read through it.
const tipText = button => button.tooltip?.text ?? button.tooltip;

test.describe('Neo.toolbar.ActionButton', () => {
    let button;

    test.afterEach(() => {
        button?.destroy?.();
        button = null
    });

    const lockAction = () => Neo.create(ActionButton, {
        appName,
        action            : 'lock',
        actionLabel       : 'lock',
        iconCls           : 'fa fa-lock-open',
        pressedActionLabel: 'unlock',
        pressedIconCls    : 'fa fa-lock',
        pressedTooltip    : 'Unlock this pane',
        tooltip           : 'Lock this pane'
    });

    test('one flag drives icon, tooltip and accessible name in both directions', () => {
        button = lockAction();

        expect(button.iconCls, 'resting icon').toBe('fa fa-lock-open');
        expect(tipText(button), 'resting tooltip').toBe('Lock this pane');

        button.pressed = true;

        expect(button.iconCls, 'pressed icon').toBe('fa fa-lock');
        expect(tipText(button), 'pressed tooltip').toBe('Unlock this pane');
        expect(button.vdom['aria-label'], 'pressed accessible name').toBe('unlock');

        button.pressed = false;

        // The reversal restores what the CONFIG declared, not whatever the last swap left behind.
        expect(button.iconCls, 'restored icon').toBe('fa fa-lock-open');
        expect(tipText(button), 'restored tooltip').toBe('Lock this pane');
        expect(button.vdom['aria-label'], 'restored accessible name').toBe('lock')
    });

    test('a transition publishes exactly one update, not one per axis', async () => {
        button = lockAction();

        let published = 0;

        const realUpdate = button.update.bind(button);

        // Counts PUBLICATIONS, not invocations. `setSilent` suppresses the effect and not the call
        // — `VdomLifecycle#update` under `silentVdomUpdate` only flags `needsVdomUpdate` and
        // returns — so a naive call counter reports every suppressed hook and reads as four.
        button.update = (...args) => {
            !button.silentVdomUpdate && published++;
            return realUpdate(...args)
        };

        button.pressed = true;

        // Three axes move — icon, tooltip, accessible name — and `setSilent` batches them so the
        // vdom attribute rides the same update as the configs. Two publications here would mean
        // the configs published before the attribute was written.
        expect(published, 'one publication for a three-axis transition').toBe(1)
    });

    test('an action with no pressed side behaves as the plain button it replaces', () => {
        button = Neo.create(ActionButton, {
            appName,
            action : 'close',
            iconCls: 'fa fa-xmark',
            tooltip: 'Close'
        });

        button.pressed = true;

        expect(button.iconCls, 'icon is unchanged without a pressed side').toBe('fa fa-xmark');
        expect(tipText(button), 'tooltip is unchanged without a pressed side').toBe('Close')
    });

    test('a gated toggle keeps its reversal offered while pressed, and its declared gate intact', () => {
        const toolbar = Neo.create(Toolbar, {
            appName,
            actions: [{
                action            : 'lock',
                actionLabel       : 'lock',
                iconCls           : 'fa fa-lock-open',
                ntype             : 'toolbar-action-button',
                pressedActionLabel: 'unlock',
                pressedIconCls    : 'fa fa-lock',
                showOnFocus       : true
            }]
        });

        const action = toolbar.getActionItem('lock');

        // Focus has not arrived, so a gated action is withdrawn: same instance, no node.
        expect(action.vdom.removeDom, 'withdrawn while resting and unfocused').toBe(true);

        action.pressed = true;

        // A persistent state must keep its reversal reachable without re-entering focus, and the
        // action asks its OWNER to re-stamp presence — a child cannot re-insert its own node.
        expect(action.vdom.removeDom, 'offered while the state holds').toBeUndefined();
        // The consumer's declared gate is never rewritten to express that; the toolbar derives it.
        expect(action.showOnFocus, 'the declared gate is untouched').toBe(true);

        action.pressed = false;

        expect(action.vdom.removeDom, 'withdrawn again once the state is gone').toBe(true);

        toolbar.destroy()
    })
});
