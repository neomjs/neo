import {setup} from '../../setup.mjs';

const appName = 'ManagerFocusTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import FocusManager   from '../../../../src/manager/Focus.mjs';

test.describe('Neo.manager.Focus', () => {
    let components;

    test.afterEach(() => {
        components?.forEach(component => component.destroy());
        components = null;

        FocusManager.history = [];
        FocusManager.lastFocusInDate = null;
        FocusManager.lastFocusOutDate = null;
    });

    function createFocusComponent(id, parentId, log) {
        const component = Neo.create(Component, {
            appName,
            id,
            parentId
        });

        component.onFocusEnter = data => log.push(['enter', id, data.component.id]);
        component.onFocusLeave = data => log.push(['leave', id, data.component.id]);
        component.onFocusMove  = data => log.push(['move',  id, data.component.id, data.oldPath, data.path]);

        return component
    }

    test('fires focusMove only on the closest common component', () => {
        const log = [];

        components = [
            createFocusComponent('focus-root',       'document.body', log),
            createFocusComponent('focus-parent',     'focus-root',    log),
            createFocusComponent('focus-old-child',  'focus-parent',  log),
            createFocusComponent('focus-new-child',  'focus-parent',  log)
        ];

        const [root, parent, oldChild, newChild] = components;

        root.containsFocus = true;
        parent.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history = [{
            componentPath: ['focus-old-child', 'focus-parent', 'focus-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            componentPath: ['focus-new-child', 'focus-parent', 'focus-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['enter', 'focus-new-child', 'focus-new-child'],
            ['move',  'focus-parent',    'focus-parent', ['old-dom-node'], ['new-dom-node']]
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(parent.containsFocus).toBe(true);
        expect(root.containsFocus).toBe(true);
        expect(FocusManager.history[0].componentPath).toEqual(['focus-new-child', 'focus-parent', 'focus-root']);
    });

    test('handles disjoint component paths without firing focusMove', () => {
        const log = [];

        components = [
            createFocusComponent('focus-old-root',  'document.body',  log),
            createFocusComponent('focus-old-child', 'focus-old-root', log),
            createFocusComponent('focus-new-root',  'document.body',  log),
            createFocusComponent('focus-new-child', 'focus-new-root', log)
        ];

        const [oldRoot, oldChild, newRoot, newChild] = components;

        oldRoot.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history = [{
            componentPath: ['focus-old-child', 'focus-old-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            componentPath: ['focus-new-child', 'focus-new-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['leave', 'focus-old-root',  'focus-old-root'],
            ['enter', 'focus-new-child', 'focus-new-child'],
            ['enter', 'focus-new-root',  'focus-new-root']
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(oldRoot.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(newRoot.containsFocus).toBe(true);
        expect(FocusManager.history[0].componentPath).toEqual(['focus-new-child', 'focus-new-root']);
    });

    test('records history when the closest common component no longer exists', () => {
        const log = [];

        components = [
            createFocusComponent('focus-old-child', 'document.body', log),
            createFocusComponent('focus-new-child', 'document.body', log)
        ];

        const [oldChild, newChild] = components;

        oldChild.containsFocus = true;

        FocusManager.history = [{
            componentPath: ['focus-old-child', 'focus-missing-common', 'focus-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            componentPath: ['focus-new-child', 'focus-missing-common', 'focus-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['enter', 'focus-new-child', 'focus-new-child']
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(FocusManager.history[0].componentPath).toEqual(['focus-new-child', 'focus-missing-common', 'focus-root']);
        expect(FocusManager.history[0].data.path).toEqual(['new-dom-node']);
    });

    test('notifies only the nearest common component for focusChange consumers', () => {
        const log = [];

        components = [
            createFocusComponent('focus-root',      'document.body', log),
            createFocusComponent('focus-parent',    'focus-root',    log),
            createFocusComponent('focus-old-child', 'focus-parent',  log),
            createFocusComponent('focus-new-child', 'focus-parent',  log)
        ];

        const [root, parent, oldChild] = components;

        root.onFocusChange   = data => log.push(['change', 'root',   data.component.id, data.oldPath, data.path]);
        parent.onFocusChange = data => log.push(['change', 'parent', data.component.id, data.oldPath, data.path]);

        root.containsFocus = true;
        parent.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history = [{
            componentPath: ['focus-old-child', 'focus-parent', 'focus-root'],
            data         : {path: ['old-event-node']}
        }];

        FocusManager.focusMove({
            componentPath: ['focus-new-child', 'focus-parent', 'focus-root'],
            data         : {
                path         : ['new-event-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave',  'focus-old-child', 'focus-old-child'],
            ['enter',  'focus-new-child', 'focus-new-child'],
            ['move',   'focus-parent',    'focus-parent', ['old-event-node'], ['new-event-node']],
            ['change', 'parent',          'focus-parent', ['old-event-node'], ['new-event-node']]
        ]);
    });
});
