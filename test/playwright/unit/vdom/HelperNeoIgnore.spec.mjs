import {setup} from '../../setup.mjs';

const appName = 'DebugHelperTest';

setup({
    neoConfig: {
        useDomApiRenderer: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

test.describe('VdomHelper Debug', () => {

    test('Should NOT generate deltas for matching neoIgnore component references', () => {
        const vdom = {
            id: 'parent',
            cn: [
                {componentId: 'child-1', neoIgnore: true},
                {componentId: 'child-2', neoIgnore: true}
            ]
        };

        const oldVnode = {
            id: 'parent',
            childNodes: [
                {componentId: 'child-1'},
                {componentId: 'child-2'}
            ],
            attributes: {},
            style: {},
            className: [],
            nodeName: 'div',
            vtype: 'vnode'
        };

        const {deltas, vnode} = VdomHelper.update({vdom, vnode: oldVnode});

        expect(deltas.length).toBe(0);
    });

    test('Should SKIP insertNode if VNode component reference is missing (Mismatch + neoIgnore)', () => {
        const vdom = {
            id: 'parent',
            cn: [
                {componentId: 'child-1', neoIgnore: true},
                {componentId: 'child-2', neoIgnore: true}
            ]
        };

        // Missing child-2 in VNode
        const oldVnode = {
            id: 'parent',
            childNodes: [
                {componentId: 'child-1'}
            ],
            attributes: {},
            style: {},
            className: [],
            nodeName: 'div',
            vtype: 'vnode'
        };

        const {deltas} = VdomHelper.update({vdom, vnode: oldVnode});

        // Expectation: insertNode skipped due to neoIgnore. No other changes.
        expect(deltas.length).toBe(0);
    });
    
    test('Should SKIP insertNode but REMOVE old node if VNode mismatch (Empty Object + neoIgnore)', () => {
        const vdom = {
            id: 'parent',
            cn: [
                {componentId: 'child-1', neoIgnore: true},
                {componentId: 'child-2', neoIgnore: true}
            ]
        };

        // Empty object at index 1
        const oldVnode = {
            id: 'parent',
            childNodes: [
                {componentId: 'child-1'},
                {} // <--- The suspicious empty object
            ],
            attributes: {},
            style: {},
            className: [],
            nodeName: 'div',
            vtype: 'vnode'
        };

        const {deltas} = VdomHelper.update({vdom, vnode: oldVnode});

        // Expectation: Old empty object removed. New child-2 insert skipped.
        expect(deltas.length).toBeGreaterThan(0);
        const insert = deltas.find(d => d.action === 'insertNode');
        expect(insert).toBeUndefined();
        
        const remove = deltas.find(d => d.action === 'removeNode');
        expect(remove).toBeTruthy();
    });

    test('Should SKIP insertNode if VNode component reference is missing AND neoIgnore is true (Explicit)', () => {
        const vdom = {
            id: 'parent',
            cn: [
                {componentId: 'child-1', neoIgnore: true},
                {componentId: 'child-2', neoIgnore: true}
            ]
        };

        // Missing child-2 in VNode
        const oldVnode = {
            id: 'parent',
            childNodes: [
                {componentId: 'child-1'}
            ],
            attributes: {},
            style: {},
            className: [],
            nodeName: 'div',
            vtype: 'vnode'
        };

        const {deltas} = VdomHelper.update({vdom, vnode: oldVnode});

        // Expectation: The insert for child-2 should be skipped because it is neoIgnore
        const insert = deltas.find(d => d.action === 'insertNode');
        expect(insert).toBeUndefined();
    });
});
