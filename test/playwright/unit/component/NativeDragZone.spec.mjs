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

    test('a grid with useInternalId: true and {record.<field>} tokens pushes business field values and refreshes them on record updates (#18113)', async () => {
        // Clear the beforeEach mock before importing NativeDragSource so Neo.setupClass does not see a namespace collision
        delete Neo.main.addon.NativeDragSource;

        await import('../../../../src/manager/Instance.mjs');
        const {default: Store}        = await import('../../../../src/data/Store.mjs');
        const {default: Model}        = await import('../../../../src/data/Model.mjs');
        const {default: GridBody}     = await import('../../../../src/grid/Body.mjs');
        const {default: NativeSource} = await import('../../../../src/main/addon/NativeDragSource.mjs');

        const originalDocument = globalThis.document;
        const documentRef      = new EventTarget();
        documentRef.body       = {classList: {add() {}, remove() {}}};
        globalThis.document    = documentRef;

        const owners            = {};
        const originalDomAccess = Neo.main.DomAccess;
        Neo.main.DomAccess      = {getElement: id => owners[id] ?? null};

        const addon    = Neo.create(NativeSource, {});
        const payloads = [];
        Neo.main.addon.NativeDragSource = {
            claimsEvent: event => addon.claimsEvent(event),
            register   : data => {
                payloads.push(data);
                addon.register(data)
            },
            unregister : data => addon.unregister(data)
        };

        class DragEntityModel extends Model {
            static config = {
                className: 'Test.Unit.Component.NativeDragZone.DragEntityModel',
                fields   : [
                    {name: 'id',   type: 'String'},
                    {name: 'code', type: 'String'}
                ]
            }
        }
        DragEntityModel = Neo.setupClass(DragEntityModel);

        const store = Neo.create(Store, {
            model: DragEntityModel,
            data : [
                {id: 'biz-101', code: 'ALPHA'},
                {id: 'biz-202', code: 'BETA'}
            ]
        });

        try {
            const firstRecord = store.getAt(0);
            const internalKey = store.getInternalId(firstRecord);
            expect(internalKey).toMatch(/^neo-record-/);

            // Exercise a grid.Body pairing useInternalId: true (its default) with {record.id}
            instance = Neo.create(GridBody, {
                appName       : 'TestApp',
                windowId      : 1,
                useInternalId : true,
                store,
                nativeDragZone: {
                    delegate: '.neo-grid-row',
                    types   : {
                        'application/x-entity-id': '{record.id}',
                        'text/plain'             : 'entity:{record.id}:{record.code}:{data-record-id}'
                    }
                }
            });

            expect(instance.useInternalId).toBe(true);
            expect(instance.getRecordId(firstRecord)).toBe(internalKey);

            instance.mounted = true;

            expect(payloads.length).toBe(1);
            expect(payloads[0].records[internalKey]).toEqual({id: 'biz-101', code: 'ALPHA'});

            // Drive a drag on the row node whose DOM attribute is the internalId (neo-record-N)
            const rowNode = {
                attributes: {'data-record-id': internalKey},
                draggable : false,
                closest(selector)  { return selector === '.neo-grid-row' ? this : null },
                getAttribute(name) { return this.attributes[name] ?? null },
                removeAttribute()  { this.draggable = false }
            };
            owners[instance.id] = {contains: candidate => candidate === rowNode};

            const dt1 = {data: {}, setData(type, val) { this.data[type] = val }};
            addon.onMouseDown({button: 0, ctrlKey: false, metaKey: false, target: rowNode});
            addon.onDragStart({target: rowNode, dataTransfer: dt1});
            addon.onGestureEnd();

            // AC-1 & AC-6: DataTransfer carries the business id ('biz-101') while data-record-id is neo-record-N
            expect(dt1.data['application/x-entity-id']).toBe('biz-101');
            expect(dt1.data['text/plain']).toBe(`entity:biz-101:ALPHA:${internalKey}`);

            // AC-5: Mutate the underlying record and verify the refreshed registration yields the new value
            firstRecord.code = 'OMEGA';

            expect(payloads.length).toBeGreaterThanOrEqual(2);
            expect(payloads.at(-1).records[internalKey]).toEqual({id: 'biz-101', code: 'OMEGA'});

            const dt2 = {data: {}, setData(type, val) { this.data[type] = val }};
            addon.onMouseDown({button: 0, ctrlKey: false, metaKey: false, target: rowNode});
            addon.onDragStart({target: rowNode, dataTransfer: dt2});
            addon.onGestureEnd();

            expect(dt2.data['text/plain']).toBe(`entity:biz-101:OMEGA:${internalKey}`);
        } finally {
            instance?.destroy();
            instance = null;
            store.destroy();
            addon.destroy();
            originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
            originalDocument  === undefined ? delete globalThis.document : globalThis.document = originalDocument
        }
    });
});
