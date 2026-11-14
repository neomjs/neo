import {setup} from '../../setup.mjs';

const appName = 'RevertFocusOnDepartureTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';

/**
 * @summary A component that departs (destroy, unmount) while it holds focus hands it back with `restoreFrom`, so the
 * main thread applies it only to a lost focus: a tab pressed in another tabs node while a dock refresh rebuilds this
 * one's shell keeps its focus. An explicit `revertFocus()` stays unguarded, and a field forwards the guard to its input.
 */
test.describe('Neo.component.Base: focus handed back on departure', () => {
    let calls, departing, previous;

    test.beforeEach(() => {
        calls     = [];
        previous  = Neo.create(Component, {appName, windowId: 'focus-window'});
        departing = Neo.create(Component, {appName, windowId: 'focus-window'});

        previous.focus           = (...args) => calls.push(args);
        departing.containsFocus  = true;
        departing.focusEnterData = {relatedTarget: {id: previous.id}}
    });

    test.afterEach(() => {
        previous.destroy()
    });

    test('a destroy hands focus back with restoreFrom set to the departing component', () => {
        const {id} = departing;

        departing.destroy();

        expect(calls).toEqual([[undefined, false, undefined, undefined, id]])
    });

    test('an unmount departs too', () => {
        departing.mounted = true;
        departing.mounted = false;

        expect(calls).toEqual([[undefined, false, undefined, undefined, departing.id]]);

        departing.containsFocus = false;
        departing.destroy()
    });

    test('an explicit revertFocus hands focus back unguarded', () => {
        departing.revertFocus();

        expect(calls).toEqual([[]]);

        departing.containsFocus = false;
        departing.destroy()
    });

    test('a text field forwards restoreFrom to its input element', () => {
        const field    = Neo.create(TextField, {appName, windowId: 'focus-window'}),
              original = Neo.main.DomAccess.focus,
              requests = [];

        Neo.main.DomAccess.focus = data => requests.push(data);

        try {
            field.focus(undefined, false, undefined, undefined, 'departing-shell');
            expect(requests).toEqual([expect.objectContaining({id: field.getInputElId(), restoreFrom: 'departing-shell'})])
        } finally {
            Neo.main.DomAccess.focus = original;
            departing.containsFocus = false;
            departing.destroy();
            field.destroy()
        }
    })
});
