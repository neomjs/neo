import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'DeltaCaptureTest',
        vnodeInitialising: false
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator   from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper           from '../../../../src/vdom/Helper.mjs';
import {createDeltaCapture} from '../../util/DeltaCapture.mjs';

const baseVdom = {
    tag : 'section',
    id  : 'delta-capture-root',
    cn  : [
        {tag: 'span', id: 'delta-capture-label', text: 'before'}
    ]
};

function createVNode(vdom = baseVdom) {
    return VdomHelper.create({vdom, appName: 'DeltaCaptureTest', parentId: 'document.body'}).vnode
}

test.describe('DeltaCapture', () => {
    let captures = [];

    test.afterEach(() => {
        captures.forEach(capture => capture.restore());
        captures = [];
        Neo.applyDeltas = async () => {}
    });

    function install(opts) {
        const capture = createDeltaCapture(opts);

        captures.push(capture);

        return capture
    }

    test('captures applyDeltas batches with tap/layer metadata and restores the seam', async () => {
        const original = async (windowId, deltas) => ({windowId, count: Array.isArray(deltas) ? deltas.length : 1});

        Neo.applyDeltas = original;

        const capture = install({tap: 'applyDeltas'});

        await Neo.applyDeltas('window-1', [
            {id: 'delta-capture-root', style: {color: 'red'}},
            {action: 'removeNode', id: 'delta-capture-old'}
        ]);

        expect(capture.records).toEqual([{
            deltas: [
                {id: 'delta-capture-root', style: {color: 'red'}},
                {action: 'removeNode', id: 'delta-capture-old'}
            ],
            epoch   : 'default',
            layer   : 'main-pre-apply',
            tap     : 'applyDeltas',
            windowId: 'window-1'
        }]);
        expect(capture.deltasIn('default')).toEqual([[
            {id: 'delta-capture-root', style: {color: 'red'}},
            {action: 'removeNode', id: 'delta-capture-old'}
        ]]);

        capture.restore();

        await Neo.applyDeltas('window-1', {id: 'delta-capture-root', cls: {add: ['ignored']}});

        expect(Neo.applyDeltas).toBe(original);
        expect(capture.records.length).toBe(1)
    });

    test('captures VdomHelper.update() return batches through helperReturn', () => {
        const capture = install({tap: 'helperReturn'}),
              vnode   = createVNode();

        const result = VdomHelper.update({
            vnode,
            vdom: {
                ...baseVdom,
                cn: [
                    {tag: 'span', id: 'delta-capture-label', text: 'after'}
                ]
            }
        });

        expect(result.deltas.length).toBe(1);
        expect(capture.recordsIn('default')[0].tap).toBe('helperReturn');
        expect(capture.recordsIn('default')[0].layer).toBe('vdom-pre-send');
        expect(capture.recordsIn('default')[0].windowId).toBeNull();
        expect(capture.deltasIn('default')).toEqual([result.deltas])
    });

    test('subsumes component-return and console-harvest legacy patterns through explicit seams', async () => {
        const componentCapture = install({tap: 'helperReturn'}),
              vnode            = createVNode();

        function componentSetLike(vdom) {
            return VdomHelper.update({vnode, vdom})
        }

        const result = componentSetLike({
            ...baseVdom,
            cn: [
                {tag: 'span', id: 'delta-capture-label', text: 'component'}
            ]
        });

        expect(componentCapture.deltasIn('default')).toEqual([result.deltas]);

        componentCapture.restore();

        const logCalls = [],
              original = async () => {};

        Neo.applyDeltas = original;

        const applyCapture = install({tap: 'applyDeltas'}),
              originalLog   = console.log;

        console.log = (...args) => logCalls.push(args);

        try {
            await Neo.applyDeltas('window-1', [
                {id: 'delta-capture-root', cls: {add: ['final']}}
            ])
        } finally {
            console.log = originalLog
        }

        expect(logCalls).toEqual([]);
        expect(applyCapture.deltasIn('default')).toEqual([[
            {id: 'delta-capture-root', cls: {add: ['final']}}
        ]])
    });

    test('attributes batches to explicit epoch labels and scoped async windows', async () => {
        Neo.applyDeltas = async () => {};

        const capture = install({tap: 'applyDeltas'});

        await Neo.applyDeltas('window-1', {id: 'before-window'});

        capture.epoch('drag-hold');
        await Neo.applyDeltas('window-1', [
            {id: 'delta-capture-row', style: {transform: 'translateY(20px)'}}
        ]);

        await capture.window('drop', async () => {
            await Neo.applyDeltas('window-1', [
                {action: 'moveNode', id: 'delta-capture-row', parentId: 'delta-capture-root', index: 0}
            ])
        });

        await Neo.applyDeltas('window-1', [
            {id: 'delta-capture-row', style: {transform: 'translateY(0px)'}}
        ]);

        expect(capture.deltasIn('default')).toEqual([[{id: 'before-window'}]]);
        expect(capture.deltasIn('drag-hold')).toEqual([
            [{id: 'delta-capture-row', style: {transform: 'translateY(20px)'}}],
            [{id: 'delta-capture-row', style: {transform: 'translateY(0px)'}}]
        ]);
        expect(capture.deltasIn('drop')).toEqual([[
            {action: 'moveNode', id: 'delta-capture-row', parentId: 'delta-capture-root', index: 0}
        ]])
    });

    test('attributes applyDeltas records to their source windowId', async () => {
        Neo.applyDeltas = async () => {};

        const capture = install({tap: 'applyDeltas'});

        await Neo.applyDeltas('window-1', {id: 'delta-capture-shared', text: 'first'});
        await Neo.applyDeltas('window-2', {id: 'delta-capture-shared', text: 'second'});
        await Neo.applyDeltas('window-1', {id: 'delta-capture-shared', text: 'third'});

        const records = capture.recordsIn('default');

        expect(records.map(record => record.windowId)).toEqual(['window-1', 'window-2', 'window-1']);
        expect(records.filter(record => record.windowId === 'window-1').map(record => record.deltas)).toEqual([
            [{id: 'delta-capture-shared', text: 'first'}],
            [{id: 'delta-capture-shared', text: 'third'}]
        ]);
        expect(records.filter(record => record.windowId === 'window-2').map(record => record.deltas)).toEqual([
            [{id: 'delta-capture-shared', text: 'second'}]
        ])
    });

    test('classifies effective ops and validates findings per preserved batch', async () => {
        Neo.applyDeltas = async () => {};

        const capture = install({tap: 'applyDeltas'});

        await Neo.applyDeltas('window-1', [
            {id: 'delta-capture-root', cls: {add: ['active']}},
            {action: 'insertNode', parentId: 'delta-capture-root', index: 0, vnode: {id: 'delta-capture-child'}}
        ]);
        await Neo.applyDeltas('window-1', [
            {style: {color: 'red'}}
        ]);

        expect(capture.opsIn('default')).toEqual({
            insertNode: 1,
            updateNode: 2
        });

        const findings = capture.findingsIn('default', {useDomApiRenderer: true});

        expect(findings[0]).toEqual({batchIndex: 0, valid: true, findings: []});
        expect(findings[1].batchIndex).toBe(1);
        expect(findings[1].valid).toBe(false);
        expect(findings[1].findings[0].rule).toBe('U4')
    });

    test('guards double installs and restores the previous epoch after throwing windows', async () => {
        Neo.applyDeltas = async () => {};

        const capture = install({tap: 'applyDeltas'});

        expect(() => createDeltaCapture({tap: 'applyDeltas'})).toThrow(/already installed/);

        capture.epoch('steady');

        await expect(capture.window('throwing', async () => {
            await Neo.applyDeltas('window-1', {id: 'inside-throwing-window'});
            throw new Error('boom')
        })).rejects.toThrow('boom');

        await Neo.applyDeltas('window-1', {id: 'after-throwing-window'});

        expect(capture.activeEpoch).toBe('steady');
        expect(capture.deltasIn('throwing')).toEqual([[{id: 'inside-throwing-window'}]]);
        expect(capture.deltasIn('steady')).toEqual([[{id: 'after-throwing-window'}]])
    });
});
