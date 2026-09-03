import {setup} from '../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import Component      from '../../../../src/component/Base.mjs';

test.describe('Neo.component.Base#nativeDragZone lifecycle', () => {
    let calls, instance;

    const zone = () => ({delegate: '.entity', types: {'text/plain': 'entity:{data-record-id}'}});

    test.beforeEach(() => {
        calls = [];

        Neo.main = Neo.main || {};
        Neo.main.DomEvents = {registerPreventDefaultTargets: () => {}};
        Neo.main.addon     = {
            NativeDragSource: {
                claimsEvent: () => false,
                register   : data => calls.push(['register',   data.windowId, data.ownerId, data.delegate]),
                unregister : data => calls.push(['unregister', data.windowId, data.ownerId])
            }
        }
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null;
        delete Neo.main.addon;
        delete Neo.main.DomEvents
    });

    test('the declaration reaches the addon on mount, not before', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        expect(calls).toEqual([]);

        instance.mounted = true;

        expect(calls).toEqual([['register', 1, instance.id, '.entity']])
    });

    test('a pre-mount reset drops the pending send and never touches the remote', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        instance.nativeDragZone = null;
        instance.mounted        = true;

        expect(calls).toEqual([])
    });

    test('a reactive replacement retires the held registration and issues the successor', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        instance.nativeDragZone = {delegate: '.other', types: {}};

        expect(calls).toEqual([
            ['register',   1, instance.id, '.entity'],
            ['unregister', 1, instance.id],
            ['register',   1, instance.id, '.other']
        ])
    });

    test('destroy retires the registration in the realm that holds it', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        const id = instance.id;

        instance.destroy();
        instance = null;

        expect(calls).toEqual([
            ['register',   1, id, '.entity'],
            ['unregister', 1, id]
        ])
    });

    test('a window transfer retires in the OLD realm and re-registers with the NEW mount', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});
        instance.mounted = true;

        // the transfer: the component leaves window 1...
        instance.mounted  = false;
        instance.windowId = 2;

        // ...the unregister must address window 1, where the registration lives
        expect(calls).toEqual([
            ['register',   1, instance.id, '.entity'],
            ['unregister', 1, instance.id]
        ]);

        // ...and the re-registration waits for the mount in window 2
        instance.mounted = true;

        expect(calls[2]).toEqual(['register', 2, instance.id, '.entity'])
    });

    test('a never-registered declaration destroys without a remote call', () => {
        instance = Neo.create(Component, {appName: 'TestApp', nativeDragZone: zone(), windowId: 1});

        instance.destroy();
        instance = null;

        expect(calls).toEqual([])
    });
});

/**
 * The field-token half of the declaration: which fields a payload names, and how their values
 * reach the addon.
 *
 * @see https://github.com/neomjs/neo/issues/18113
 */
test.describe('Neo.component.Base#nativeDragZone field tokens', () => {
    let payloads, instance;

    test.beforeEach(() => {
        payloads = [];

        Neo.main = Neo.main || {};
        Neo.main.DomEvents = {registerPreventDefaultTargets: () => {}};
        Neo.main.addon     = {
            NativeDragSource: {
                claimsEvent : () => false,
                register    : data => payloads.push(['register', data.fields]),
                unregister  : () => {},
                updateFields: data => payloads.push(['updateFields', data.fields])
            }
        }
    });

    test.afterEach(() => {
        instance?.destroy();
        instance = null;
        delete Neo.main.addon;
        delete Neo.main.DomEvents
    });

    /**
     * A component answering the hook from a fixed table, standing in for a data-bound surface.
     * It records the field names it was asked for, which is the contract that matters here: the
     * list is DERIVED from the templates, so it cannot drift from them.
     */
    class FieldComponent extends Component {
        static config = {
            className: 'Test.Unit.Component.NativeDragZone.FieldComponent'
        }

        askedFor = []
        table    = {'row-0': {id: 'CNET-1', title: 'One'}}

        getNativeDragFields(fieldNames) {
            this.askedFor.push([...fieldNames]);
            return this.table
        }
    }

    Neo.setupClass(FieldComponent);

    test('the field list is parsed from the templates, so it cannot disagree with them', () => {
        instance = Neo.create(FieldComponent, {
            appName       : 'TestApp',
            nativeDragZone: {
                delegate: '.entity',
                types   : {
                    'application/x-id': '{field:id}',
                    'text/plain'      : 'cnet:{field:id} — {field:title}',
                    'text/x-mixed'    : '{data-record-id}/{field:title}'
                }
            },
            windowId: 1
        });

        instance.mounted = true;

        // Deduplicated across templates, attribute tokens excluded, order of first appearance.
        expect(instance.askedFor[0]).toEqual(['id', 'title']);
        expect(payloads[0]).toEqual(['register', {'row-0': {id: 'CNET-1', title: 'One'}}])
    });

    test('an attribute-only declaration asks for nothing and sends no field map', () => {
        // The control for every consumer that exists today: the hook must not be consulted, and
        // `fields` must reach the addon as the null it treats exactly as before.
        instance = Neo.create(FieldComponent, {
            appName       : 'TestApp',
            nativeDragZone: {delegate: '.entity', types: {'text/plain': 'entity:{data-record-id}'}},
            windowId      : 1
        });

        instance.mounted = true;

        // Not "asked for an empty list" — not asked AT ALL. The hook is consulted only when its
        // answer can be used, so an override that ignores its argument still ships no map here.
        expect(instance.askedFor, 'the hook is never consulted').toEqual([]);
        expect(payloads[0]).toEqual(['register', null])
    });

    test('updateNativeDragFields pushes a fresh map, and stays silent when there is nothing to push', () => {
        instance = Neo.create(FieldComponent, {
            appName       : 'TestApp',
            nativeDragZone: {delegate: '.entity', types: {'text/plain': '{field:id}'}},
            windowId      : 1
        });

        instance.mounted = true;
        payloads.length  = 0;

        instance.table = {'row-0': {id: 'CNET-2'}};
        instance.updateNativeDragFields();

        expect(payloads).toEqual([['updateFields', {'row-0': {id: 'CNET-2'}}]]);

        // A render path calls this unconditionally, so the cheap exits are load-bearing rather
        // than defensive: an attribute-only declaration and a retired one must both send nothing.
        payloads.length = 0;
        instance.nativeDragZone = {delegate: '.entity', types: {'text/plain': '{data-record-id}'}};
        instance.updateNativeDragFields();

        expect(payloads.filter(([verb]) => verb === 'updateFields'),
            'an attribute-only declaration pushes no map').toEqual([]);

        payloads.length         = 0;
        instance.nativeDragZone = null;
        instance.updateNativeDragFields();

        expect(payloads, 'and a retired declaration pushes nothing at all').toEqual([])
    })
});
