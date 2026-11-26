import {setup} from '../../setup.mjs';

const appName = 'EmptyStateUnitTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../src/Neo.mjs';
import * as core           from '../../../../src/core/_export.mjs';
import ComponentController from '../../../../src/controller/Component.mjs';
import Container           from '../../../../src/container/Base.mjs';
import EmptyState          from '../../../../src/component/EmptyState.mjs';
import DetailPane          from '../../../../examples/fileExplorer/DetailPane.mjs';

class EmptyStateTestController extends ComponentController {
    static config = {
        className: 'Test.Unit.Component.EmptyStateTestController'
    }

    calls = []

    onRecover(payload) {
        this.calls.push(payload)
    }
}

EmptyStateTestController = Neo.setupClass(EmptyStateTestController);

test.describe('Neo.component.EmptyState', () => {
    test('renders text-only state cleanly without decorative artwork or empty wrappers', () => {
        const state = Neo.create(EmptyState, {
            appName,
            contentAlign: 'center',
            text        : 'Select a file or a folder to see its details.',
            ui          : 'plain'
        });

        expect(state.vdom.cls).toEqual(expect.arrayContaining(['neo-empty-state', 'neo-empty-state-plain', 'neo-align-center']));
        expect(state.iconNode.removeDom).toBe(true);
        expect(state.titleNode.removeDom).toBe(false);
        expect(state.titleNode.text).toBe('Select a file or a folder to see its details.');
        expect(state.descriptionNode.removeDom).toBe(true);
        expect(state.actionsNode.removeDom).toBe(true);
        expect(state.vdom.text).toBeUndefined();

        state.text = null;
        expect(state.titleNode.removeDom).toBe(true);

        state.destroy()
    });

    test('supports optional description, aria-hidden icon, accessible action button, and ntype creation', () => {
        const state = Neo.ntype({
            appName,
            ntype          : 'empty-state',
            actionAriaLabel: 'Clear current catalog search',
            actionIconCls  : 'fa fa-xmark',
            actionText     : 'Clear search',
            description    : 'Try a capability term or press Escape to return.',
            iconCls        : 'fa fa-magnifying-glass',
            text           : 'No published examples match your query.'
        });

        expect(state.className).toBe('Neo.component.EmptyState');
        expect(state.iconNode.removeDom).toBe(false);
        expect(state.iconNode['aria-hidden']).toBe('true');
        expect(state.iconNode.cls).toEqual(expect.arrayContaining(['neo-empty-state-glyph', 'fa', 'fa-magnifying-glass']));
        expect(state.titleNode.text).toBe('No published examples match your query.');
        expect(state.descriptionNode.removeDom).toBe(false);
        expect(state.descriptionNode.text).toBe('Try a capability term or press Escape to return.');
        expect(state.actionsNode.removeDom).toBe(false);
        expect(state.actionButtonNode.tag).toBe('button');
        expect(state.actionButtonNode.type).toBe('button');
        expect(state.actionButtonNode['aria-label']).toBe('Clear current catalog search');
        expect(state.actionIconNode.removeDom).toBe(false);
        expect(state.actionIconNode['aria-hidden']).toBe('true');
        expect(state.actionIconNode.cls).toEqual(expect.arrayContaining(['neo-empty-state-action-glyph', 'fa', 'fa-xmark']));
        expect(state.actionTextNode.text).toBe('Clear search');

        state.set({
            actionAriaLabel: null,
            actionIconCls  : null,
            actionText     : null,
            description    : null,
            iconCls        : null
        });

        expect(state.iconNode.removeDom).toBe(true);
        expect(state.descriptionNode.removeDom).toBe(true);
        expect(state.actionsNode.removeDom).toBe(true);
        expect(state.actionIconNode.removeDom).toBe(true);
        expect(state.actionButtonNode['aria-label']).toBeUndefined();

        state.destroy()
    });

    test('resolves string controller actionHandler, emits action event, and respects disabled', () => {
        const fired  = [],
              parent = Neo.create(Container, {
                  appName,
                  controller: EmptyStateTestController,
                  items     : [{
                      module       : EmptyState,
                      actionHandler: 'onRecover',
                      actionText   : 'Clear search',
                      listeners    : {action: data => fired.push(data)},
                      reference    : 'empty',
                      text         : 'Nothing matched'
                  }]
              }),
              state  = parent.down({reference: 'empty'}),
              ctrl   = parent.getController();

        state.onActionClick({type: 'click'});
        expect(ctrl.calls).toHaveLength(1);
        expect(ctrl.calls[0].component).toBe(state);
        expect(fired).toHaveLength(1);

        state.disabled = true;
        expect(state.actionButtonNode.disabled).toBe(true);
        state.onActionClick({type: 'click'});
        expect(ctrl.calls).toHaveLength(1);
        expect(fired).toHaveLength(1);

        state.disabled = false;
        expect(state.actionButtonNode.disabled).toBeUndefined();

        let callbackCount = 0;
        state.actionHandler = () => { callbackCount++ };
        state.onActionClick({type: 'click'});
        expect(callbackCount).toBe(1);
        expect(fired).toHaveLength(2);

        parent.destroy()
    });

    test('DetailPane uses EmptyState when details is null and transitions cleanly to populated details and back', () => {
        const pane  = Neo.create(DetailPane, {appName}),
              empty = pane.down({reference: 'empty-state'}),
              body  = pane.down({reference: 'detail-body'});

        expect(pane.vdom.tag).toBe('section');
        expect(empty.className).toBe('Neo.component.EmptyState');
        expect(empty.hidden).toBe(false);
        expect(empty.text).toBe('Select a file or a folder to see its details.');
        expect(body.hidden).toBe(true);

        pane.details = {
            icon: ['fe-icon', 'fe-kind-script'],
            name: 'Cart.mjs',
            path: '/src/components/Cart.mjs',
            rows: [['Kind', 'JavaScript module'], ['Size', '2.1 KB']]
        };

        expect(empty.hidden).toBe(true);
        expect(body.hidden).toBe(false);
        expect(body.vdom.cn[0].cn[1].text).toBe('Cart.mjs');
        expect(body.vdom.cn[1].text).toBe('/src/components/Cart.mjs');

        pane.details = null;
        expect(empty.hidden).toBe(false);
        expect(body.hidden).toBe(true);
        expect(body.vdom.cn).toEqual([]);

        pane.destroy()
    })
});
