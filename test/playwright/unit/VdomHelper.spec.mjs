import { setup } from '../setup.mjs';

const appName = 'VdomHelperTest';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';

import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import StringFromVnode from '../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../src/vdom/Helper.mjs';
import VDomUtil        from '../../../src/util/VDom.mjs';

test.describe('Neo.vdom.Helper', () => {
    test('Create Vnode', () => {
        let vdom = {tag: 'div'};
        let { vnode } = VdomHelper.create({vdom});

        expect(vnode).toEqual({
            attributes: {},
            childNodes: [],
            className : [],
            id        : expect.any(String),
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        });

        VDomUtil.syncVdomIds(vnode, vdom);
        expect(vdom.id).toBe(vnode.id);
    });

    test('Modify vdom.cls', () => {
        let vdom = {tag: 'div'};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomIds(vnode, vdom);
        const vnodeId = vnode.id;

        // Add first class
        vdom.cls = ['neo-component'];
        let { deltas, vnode: updatedVnode1 } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode1).toEqual({
            attributes: {},
            childNodes: [],
            className : ['neo-component'],
            id        : vnodeId,
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        });
        expect(deltas).toEqual([{id: vnodeId, cls: {add: ['neo-component']}}]);

        // Add more classes
        vdom.cls = ['neo-panel', 'neo-container', 'neo-component'];
        let { deltas: deltas2, vnode: updatedVnode2 } = VdomHelper.update({vdom, vnode: updatedVnode1});

        expect(updatedVnode2.className).toEqual(['neo-panel', 'neo-container', 'neo-component']);
        expect(deltas2).toEqual([{id: vnodeId, cls: {add: ['neo-panel', 'neo-container']}}]);

        // Remove classes
        vdom.cls = ['neo-container'];
        let { deltas: deltas3, vnode: updatedVnode3 } = VdomHelper.update({vdom, vnode: updatedVnode2});

        expect(updatedVnode3.className).toEqual(['neo-container']);
        expect(deltas3).toEqual([{id: vnodeId, cls: {remove: ['neo-panel', 'neo-component']}}]);
    });

    test('Modify vdom.style', () => {
        let vdom = {tag: 'div', className: ['neo-container']};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomIds(vnode, vdom);
        const vnodeId = vnode.id;

        // Add style
        vdom.style = {backgroundColor: 'red'};
        let { deltas, vnode: updatedVnode1 } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode1.style).toEqual({backgroundColor: 'red'});
        expect(deltas).toEqual([{id: vnodeId, style: {backgroundColor: 'red'}}]);

        // Add more styles
        vdom.style = {backgroundColor: 'red', color: 'green', height: '100px'};
        let { deltas: deltas2, vnode: updatedVnode2 } = VdomHelper.update({vdom, vnode: updatedVnode1});

        expect(updatedVnode2.style).toEqual({backgroundColor: 'red', color: 'green', height: '100px'});
        expect(deltas2).toEqual([{id: vnodeId, style: {color: 'green', height: '100px'}}]);

        // Remove styles
        vdom.style = {color: 'green'};
        let { deltas: deltas3, vnode: updatedVnode3 } = VdomHelper.update({vdom, vnode: updatedVnode2});

        expect(updatedVnode3.style).toEqual({color: 'green'});
        expect(deltas3).toEqual([{id: vnodeId, style: {backgroundColor: null, height: null}}]);
    });

    test('Modify vdom attributes', () => {
        let vdom = {tag: 'div', className: ['neo-container'], style: {color: 'green'}};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomIds(vnode, vdom);
        const vnodeId = vnode.id;

        // Add attribute
        vdom.tabIndex = -1;
        let { deltas, vnode: updatedVnode1 } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode1.attributes).toEqual({tabIndex: '-1'});
        expect(deltas).toEqual([{id: vnodeId, attributes: {tabIndex: '-1'}}]);

        // Change attribute
        vdom.tabIndex = 0;
        let { deltas: deltas2, vnode: updatedVnode2 } = VdomHelper.update({vdom, vnode: updatedVnode1});

        expect(updatedVnode2.attributes).toEqual({tabIndex: '0'});
        expect(deltas2).toEqual([{id: vnodeId, attributes: {tabIndex: '0'}}]);

        // Delete attribute
        delete vdom.tabIndex;
        let { deltas: deltas3, vnode: updatedVnode3 } = VdomHelper.update({vdom, vnode: updatedVnode2});

        expect(updatedVnode3.attributes).toEqual({});
        expect(deltas3).toEqual([{id: vnodeId, attributes: {tabIndex: null}}]);
    });

    test('Modify vdom cn (childNodes)', () => {
        let vdom = {tag: 'div', className: ['neo-container'], style: {color: 'green'}};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomIds(vnode, vdom);
        const vnodeId = vnode.id;

        // Add childNodes
        vdom.cn = [{tag: 'div'}, {tag: 'div', id: 'neo-button-1'}, {tag: 'div'}];
        let { deltas, vnode: updatedVnode1 } = VdomHelper.update({vdom, vnode});
        VDomUtil.syncVdomIds(updatedVnode1, vdom);

        expect(updatedVnode1.childNodes.length).toBe(3);
        expect(updatedVnode1.childNodes[0].id).toEqual(expect.any(String));
        expect(updatedVnode1.childNodes[1].id).toBe('neo-button-1');
        expect(updatedVnode1.childNodes[2].id).toEqual(expect.any(String));

        expect(deltas.length).toBe(3);
        expect(deltas[0].action).toBe('insertNode');
        expect(deltas[1].action).toBe('insertNode');
        expect(deltas[2].action).toBe('insertNode');

        // Reorder childNodes
        let tmp = vdom.cn[0];
        vdom.cn[0] = vdom.cn[2];
        vdom.cn[2] = tmp;
        let { deltas: deltas2, vnode: updatedVnode2 } = VdomHelper.update({vdom, vnode: updatedVnode1});

        expect(updatedVnode2.childNodes[0].id).toBe(updatedVnode1.childNodes[2].id);
        expect(updatedVnode2.childNodes[2].id).toBe(updatedVnode1.childNodes[0].id);
        expect(deltas2.length).toBe(2);
        expect(deltas2[0].action).toBe('moveNode');
        expect(deltas2[1].action).toBe('moveNode');

        // Left shift
        vdom.cn.push(vdom.cn.shift());
        let { deltas: deltas3, vnode: updatedVnode3 } = VdomHelper.update({vdom, vnode: updatedVnode2});
        expect(deltas3.length).toBe(2);

        // Right shift
        vdom.cn.unshift(vdom.cn.pop());
        let { deltas: deltas4, vnode: updatedVnode4 } = VdomHelper.update({vdom, vnode: updatedVnode3});
        expect(deltas4.length).toBe(1);
    });

    test('vdom filtering (list.Base)', () => {
        let vdom = {
            cls  : ['neo-list-container', 'neo-list'],
            id   : 'neo-list-1',
            style: {},
            tag  : 'ul',
            width: 100,
            cn: [
                {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
                {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
                {tag: 'li', cls: ['neo-list-item'], html: 'Jozef',   id: 'neo-list-1__jsakalos',      tabIndex: -1},
                {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1},
                {tag: 'li', cls: ['neo-list-item'], html: 'Rich',    id: 'neo-list-1__rwaters',       tabIndex: -1},
                {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});
        expect(vnode.childNodes.length).toBe(6);

        // remove items at index: 2, 3, 4
        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];
        let { deltas, vnode: updatedVnode1 } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode1.childNodes.length).toBe(3);
        expect(deltas.length).toBe(3);
        expect(deltas).toEqual([
            {action: 'removeNode', id: 'neo-list-1__jsakalos'},
            {action: 'removeNode', id: 'neo-list-1__mrsunshine'},
            {action: 'removeNode', id: 'neo-list-1__rwaters'}
        ]);
    });

    test('Replacing a parent node with one child', () => {
        let vdom = {id: 'level-1', cn: [{id: 'level-2', cn: [{id: 'level-3'}]}]};
        let { vnode } = VdomHelper.create({vdom});

        // replace level 2 with level 3
        vdom.cn = vdom.cn[0].cn;
        let { deltas, vnode: updatedVnode } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode.childNodes.length).toBe(1);
        expect(updatedVnode.childNodes[0].id).toBe('level-3');
        expect(deltas).toEqual([
            {action: 'moveNode',   id: 'level-3', index: 1, parentId: 'level-1'},
            {action: 'removeNode', id: 'level-2'}
        ]);
    });

    test('Replacing a parent node with multiple children', () => {
        let vdom = {id: 'level-1', cn: [{id: 'level-2', cn: [{id: 'level-3-1'}, {id: 'level-3-2'}]}]};
        let { vnode } = VdomHelper.create({vdom});

        // replace level 2 with level 3
        vdom.cn = vdom.cn[0].cn;
        let { deltas, vnode: updatedVnode } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode.childNodes.length).toBe(2);
        expect(updatedVnode.childNodes[0].id).toBe('level-3-1');
        expect(updatedVnode.childNodes[1].id).toBe('level-3-2');
        expect(deltas).toEqual([
            {action: 'moveNode', id: 'level-3-1', index: 1, parentId: 'level-1'},
            {action: 'moveNode', id: 'level-3-2', index: 2, parentId: 'level-1'},
            {action: 'removeNode', id: 'level-2'}
        ]);
    });
});
