import {setup} from '../../setup.mjs';

const appName = 'ToolbarActionsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import DialogToolbar  from '../../../../src/dialog/header/Toolbar.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';

/**
 * @summary An action's name is its address. `getAction(name)` resolves exactly one action, so a toolbar
 * refuses a repeated name at the moment its actions materialise — among the consumer's own configs, or
 * against a contributed action that stays — and an action without a name is not addressable at all.
 */
test.describe('Neo.toolbar.Base — actions resolve by name, and names are unique', () => {
    const owned = [];
    const own   = instance => {
        owned.push(instance);
        return instance
    };

    test.afterEach(() => {
        owned.splice(0).forEach(instance => instance?.destroy?.())
    });

    /** The toolbar's item order by address: a spacer, an action's name, or an ordinary item's flag. */
    const names = toolbar => toolbar.items.map(item => item.isToolbarActionSpacer ? 'spacer' : (item.action ?? item.flag ?? item.text));

    test('getAction(name) is the address of exactly one action, and no name resolves nothing — even while an unnamed action exists', () => {
        const toolbar = own(Neo.create(Toolbar, {
            appName,
            actions: [{action: 'save', iconCls: 'fa fa-save'}, {text: 'Plain', handler: () => {}}],
            items  : [{module: Component, flag: 'ordinary'}]
        }));

        const save = toolbar.getAction('save');

        expect(save?.action).toBe('save');
        expect(save.isToolbarAction).toBe(true);
        expect(toolbar.getAction('missing')).toBeNull();
        expect(toolbar.getAction(), 'no name is not an address').toBeNull();
        expect(toolbar.getAction(''), 'an empty name is not an address').toBeNull();

        // the unnamed action is materialised and stays; it is simply not addressable
        expect(toolbar.getActionItems()).toHaveLength(2);
        expect(names(toolbar)).toEqual(['ordinary', 'spacer', 'save', 'Plain'])
    });

    test('unnamed actions cannot collide: two text actions without a name coexist', () => {
        const toolbar = own(Neo.create(Toolbar, {
            appName,
            actions: [{text: 'A', handler() {}}, {text: 'B', handler() {}}]
        }));

        expect(toolbar.getActionItems().map(item => item.text)).toEqual(['A', 'B'])
    });

    test('a repeated name among the consumer\'s own actions throws when they materialise — at construction and at reassignment — and a refused reassignment changes no item', () => {
        expect(() => Neo.create(Toolbar, {
            appName,
            actions: [{action: 'save', iconCls: 'fa fa-save'}, {action: 'save', text: 'Save again'}]
        })).toThrow(/duplicate toolbar action "save"/);

        const toolbar = own(Neo.create(Toolbar, {
            appName,
            actions: [{action: 'save', iconCls: 'fa fa-save'}],
            items  : [{module: Component, flag: 'ordinary'}]
        }));

        const before = [...toolbar.items];

        expect(() => {
            toolbar.actions = [{action: 'open', text: 'Open'}, {action: 'open', text: 'Open twice'}]
        }).toThrow(/duplicate toolbar action "open"/);

        expect(toolbar.items, 'nothing was removed or inserted before the refusal').toEqual(before);
        expect(toolbar.getAction('save')).toBe(before[2])
    });

    test('a contribution whose name is already present is refused before the spacer or the contribution is inserted; a distinct name inserts ahead of the consumer actions, and the consumer cannot take it back', () => {
        const toolbar = own(Neo.create(Toolbar, {
            appName,
            actions: [{action: 'save', iconCls: 'fa fa-save'}],
            items  : [{module: Component, flag: 'ordinary'}]
        }));

        const before = [...toolbar.items];

        expect(() => toolbar.addActionContribution({action: 'save', iconCls: 'fa fa-clone', handler: Neo.emptyFn}))
            .toThrow(/duplicate toolbar action "save"/);
        expect(toolbar.items).toEqual(before);

        const overflow = toolbar.addActionContribution({action: 'overflow', iconCls: 'fa fa-ellipsis', handler: Neo.emptyFn});

        expect(toolbar.getAction('overflow')).toBe(overflow);
        expect(names(toolbar)).toEqual(['ordinary', 'spacer', 'overflow', 'save']);

        // a consumer rebuild that names the contribution is refused whole: the contribution and the
        // consumer's previous actions both stay
        expect(() => {
            toolbar.actions = [{action: 'overflow', text: 'Mine now'}]
        }).toThrow(/duplicate toolbar action "overflow"/);

        expect(toolbar.getAction('overflow')).toBe(overflow);
        expect(toolbar.getAction('save'), 'the refused rebuild removed nothing').toBe(before[2])
    });

    test('the dialog header resolves its mapped string actions by name', () => {
        const header = own(Neo.create(DialogToolbar, {appName}));

        expect(header.getAction('close')?.action).toBe('close');
        expect(header.getAction('maximize')?.action).toBe('maximize');
        expect(header.getAction('close')).toBe(header.getActionItems().find(item => item.action === 'close'))
    })
});
