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

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import ComponentManager from '../../../../../src/manager/Component.mjs';
import DateField        from '../../../../../src/form/field/Date.mjs';
import FocusManager     from '../../../../../src/manager/Focus.mjs';
import Picker           from '../../../../../src/form/field/Picker.mjs';
import TimeField        from '../../../../../src/form/field/Time.mjs';

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

    test('the field owns its picker: focus moving between them never leaves the field, leaving both dismisses once', async () => {
        const picker  = field.picker,
              outside = Neo.create(Component, {appName, id: Neo.getId('picker-focus-outside')}),
              leaves  = [],
              escape  = {};
        let   dismissals = 0;

        /**
         * One DOM focus move as the main thread reports it: a focusout, and the focusin inside the manager's gap.
         * The component path is the one `manager.DomEvent` hands over — read from the component tree.
         */
        const moveFocusTo = id => {
            const [last] = FocusManager.history;

            // The first focus enters; every later one is a move
            last && FocusManager.onFocusout({componentPath: last.componentPath, data: {path: []}});
            FocusManager.onFocusin({componentPath: ComponentManager.getParentPath([id]), data: {path: [{id}]}})
        };

        field.hidePicker = () => dismissals++;
        field.on('focusLeave', () => leaves.push('field'));

        expect(ComponentManager.getParentPath([picker.id]), 'the picker sits under its field in the tree focus reads')
            .toEqual([picker.id, field.id]);

        moveFocusTo(field.id);
        moveFocusTo(picker.id);

        expect(field.containsFocus, 'the field keeps focus while its picker holds it').toBe(true);
        expect(picker.containsFocus).toBe(true);

        moveFocusTo(field.id);

        expect(leaves, 'neither direction is a leave for the field').toEqual([]);
        expect(dismissals).toBe(0);

        moveFocusTo(picker.id);
        moveFocusTo(outside.id);

        expect(leaves, 'leaving field and picker is one leave').toEqual(['field']);
        expect(field.containsFocus).toBe(false);
        expect(dismissals).toBe(1);

        field.pickerIsMounted = true;
        expect(field.onKeyDownEscape(escape)).toBe(false);
        expect(escape.cancelBubble).toBe(true);
        expect(dismissals).toBe(2);

        // The manager's pending focusout timers must not outlive the arm
        await new Promise(resolve => setTimeout(resolve, FocusManager.maxFocusInOutGap + 20));
        outside.destroy()
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

/**
 * Enter opens a closed picker unless `showPickerOnEnter` is off, which is how a grid editor leaves Enter to the grid's
 * commit. Date and Time override `onKeyDownEnter` and reach the switch through `super`.
 */
test.describe('Neo.form.field.Picker Enter', () => {
    [TestPicker, DateField, TimeField].forEach(FieldClass => {
        test(`${FieldClass.prototype.className}: Enter shows the closed picker, and with showPickerOnEnter off builds none`, () => {
            const opens = Neo.create(FieldClass, {appName, id: Neo.getId('enter-opens')}),
                  keeps = Neo.create(FieldClass, {appName, id: Neo.getId('enter-keeps'), showPickerOnEnter: false});
            let   shown = 0;

            // The default only has to ask for its picker: showing one needs a DOM
            opens.showPicker = () => shown++;
            opens.onKeyDownEnter({});

            expect(shown, 'the default opens the picker on Enter').toBe(1);

            keeps.onKeyDownEnter({});

            expect(keeps.picker, 'no picker was built').toBeNull();

            opens.destroy();
            keeps.destroy()
        })
    })
});
