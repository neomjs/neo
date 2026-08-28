import {setup} from '../../../setup.mjs';

const
    appName  = 'PickerDismissalTest',
    added    = [],
    removed  = [],
    mainView = {
        id          : 'picker-test-main-view',
        domListeners: [],

        addDomListeners(value) {
            const listeners = Array.isArray(value) ? value : [value];

            this.domListeners.push(...listeners);
            added.push(...listeners)
        },

        removeDomListeners(value) {
            const listeners = Array.isArray(value) ? value : [value];

            listeners.forEach(listener => {
                const index = this.domListeners.indexOf(listener);

                if (index > -1) {
                    this.domListeners.splice(index, 1)
                }

                removed.push(listener)
            })
        }
    };

setup({
    appConfig: {
        name: appName,
        mainView
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Picker         from '../../../../../src/form/field/Picker.mjs';

class TestPicker extends Picker {
    static config = {
        className: 'Test.Unit.Form.Field.DismissalPicker'
    }
}

TestPicker = Neo.setupClass(TestPicker);

/**
 * @summary Creates the abstract Picker contract with physical DOM work neutralized.
 * @returns {TestPicker}
 */
function createField() {
    const
        field  = Neo.create(TestPicker, {appName, id: Neo.getId('dismissal-picker')}),
        picker = field.getPicker();

    picker.initVnode = async () => {
        picker._mounted = true;
        return picker
    };
    picker.unmount = () => {
        picker._mounted = false
    };

    return field
}

test.describe('Neo.form.field.Picker outside-pointer dismissal', () => {
    let field;

    test.beforeEach(() => {
        added.length = 0;
        removed.length = 0;
        mainView.domListeners.length = 0;
        field = createField()
    });

    test.afterEach(() => {
        !field?.isDestroyed && field.destroy()
    });

    test('attaches once while shown and removes the exact listener while hidden', async () => {
        field.showPicker();
        field.showPicker();

        expect(added).toHaveLength(1);
        expect(mainView.domListeners).toEqual(added);

        await field.hidePicker();

        expect(removed).toHaveLength(1);
        expect(removed[0]).toBe(added[0]);
        expect(mainView.domListeners).toEqual([])
    });

    test('keeps field and picker pointers inside but dismisses non-focusable app chrome', () => {
        const picker     = field.picker;
        let   dismissals = 0;

        field.showPicker();
        field.hidePicker = () => dismissals++;

        field.onAppMouseDown({path: [{id: field.id}]});
        field.onAppMouseDown({path: [{id: picker.id}]});

        expect(dismissals).toBe(0);

        field.onAppMouseDown({path: [{id: 'non-focusable-workspace'}]});

        expect(dismissals).toBe(1)
    });

    test('preserves both focus-island directions and Escape semantics', () => {
        const picker = field.picker,
              escape = {};
        let   dismissals = 0;

        field.hidePicker = () => dismissals++;

        field.onFocusLeave({oldPath: [{id: picker.id}]});
        picker.onFocusLeave({oldPath: [{id: field.id}]});

        expect(dismissals).toBe(0);

        field.onFocusLeave({oldPath: [{id: 'focusable-outside'}]});
        picker.onFocusLeave({oldPath: [{id: 'focusable-outside'}]});

        field.pickerIsMounted = true;
        expect(field.onKeyDownEscape(escape)).toBe(false);
        expect(escape.cancelBubble).toBe(true);
        expect(dismissals).toBe(3)
    });

    test('removes the exact app-root listener during destroy', () => {
        field.showPicker();
        field.destroy();

        expect(added).toHaveLength(1);
        expect(removed).toHaveLength(1);
        expect(removed[0]).toBe(added[0]);
        expect(mainView.domListeners).toEqual([])
    })
});
