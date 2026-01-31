import {setup} from '../../setup.mjs';

const appName = 'VdomHelperTest';

setup({
    neoConfig: {
        useDomApiRenderer: false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import StringFromVnode from '../../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';
import VDomUtil        from '../../../../src/util/VDom.mjs';

test.describe('Neo.vdom.Helper', () => {
    test('Create Vnode', () => {
        let vdom = {tag: 'div', id: 'my-id'};
        let { vnode } = VdomHelper.create({vdom});

        expect(vnode).toEqual({
            attributes: {},
            childNodes: [],
            className : [],
            id        : 'my-id',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        });

        VDomUtil.syncVdomState(vnode, vdom);
        expect(vdom.id).toBe('my-id');
    });

    test('Modify vdom.cls', () => {
        let vdom = {tag: 'div', id: 'my-div'};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);
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
        let vdom = {tag: 'div', id: 'my-div', cls: ['neo-container']};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);
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
        let vdom = {tag: 'div', id: 'my-div', cls: ['neo-container'], style: {color: 'green'}};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);
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
        let vdom = {tag: 'div', id: 'my-div', cls: ['neo-container'], style: {color: 'green'}};
        let { vnode } = VdomHelper.create({vdom});
        VDomUtil.syncVdomState(vnode, vdom);
        const vnodeId = vnode.id;

        // 1. Add childNodes
        vdom.cn = [{tag: 'div', id: 'child-1'}, {tag: 'div', id: 'neo-button-1'}, {tag: 'div', id: 'child-3'}];
        let output = VdomHelper.update({vdom, vnode});
        let deltas = output.deltas;
        vnode = output.vnode;
        VDomUtil.syncVdomState(vnode, vdom);

        const childIds = vnode.childNodes.map(node => node.id);

        expect(vnode).toEqual({
            attributes: {},
            className : ['neo-container'],
            id        : vnodeId,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',
            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: childIds[0],  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: childIds[2],  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        });

        expect(deltas).toEqual([
            {action: 'insertNode', index: 0, outerHTML: `<div id="${childIds[0]}"></div>`,  parentId: vnodeId},
            {action: 'insertNode', index: 1, outerHTML: '<div id="neo-button-1"></div>', parentId: vnodeId},
            {action: 'insertNode', index: 2, outerHTML: `<div id="${childIds[2]}"></div>`,  parentId: vnodeId}
        ]);

        // 2. Reorder childNodes (swap)
        let tmp = vdom.cn[0];
        vdom.cn[0] = vdom.cn[2];
        vdom.cn[2] = tmp;

        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(vnode).toEqual({
            attributes: {},
            className : ['neo-container'],
            id        : vnodeId,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',
            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: childIds[2],  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: childIds[0],  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        });

        expect(deltas).toEqual([
            {action: 'moveNode', id: childIds[2],  index: 0, parentId: vnodeId},
            {action: 'moveNode', id: 'neo-button-1', index: 1, parentId: vnodeId}
        ]);

        // 3. Left shift
        vdom.cn.push(vdom.cn.shift());
        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(vnode).toEqual({
            attributes: {},
            className : ['neo-container'],
            id        : vnodeId,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',
            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: childIds[0],  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: childIds[2],  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        });

        expect(deltas).toEqual([
            {action: 'moveNode', id: 'neo-button-1', index: 0, parentId: vnodeId},
            {action: 'moveNode', id: childIds[0],  index: 1, parentId: vnodeId}
        ]);

        // 4. Right shift
        vdom.cn.unshift(vdom.cn.pop());
        output = VdomHelper.update({vdom, vnode});
        deltas = output.deltas;
        vnode = output.vnode;

        expect(vnode).toEqual({
            attributes: {},
            className : ['neo-container'],
            id        : vnodeId,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',
            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: childIds[2],  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: childIds[0],  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        });

        expect(deltas).toEqual([
            {action: 'moveNode', id: childIds[2], index: 0, parentId: vnodeId}
        ]);
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

        // recreate the 3 removed items
        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Jozef',   id: 'neo-list-1__jsakalos',      tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Rich',    id: 'neo-list-1__rwaters',       tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];

        let { deltas: deltas2, vnode: updatedVnode2 } = VdomHelper.update({vdom, vnode: updatedVnode1});
        expect(updatedVnode2.childNodes.length).toBe(6);
        expect(deltas2.length).toBe(3);

        // remove items at index: 2, 4, switch nils & tobi
        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1}
        ];

        let { deltas: deltas3, vnode: updatedVnode3 } = VdomHelper.update({vdom, vnode: updatedVnode2});
        expect(deltas3.length).toBe(3);

        // remove first list item
        vdom.cn.splice(0, 1);
        let { deltas: deltas4, vnode: updatedVnode4 } = VdomHelper.update({vdom, vnode: updatedVnode3});
        expect(deltas4.length).toBe(1);

        // restore the initial list state
        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Jozef',   id: 'neo-list-1__jsakalos',      tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Rich',    id: 'neo-list-1__rwaters',       tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];
        let { vnode: updatedVnode5 } = VdomHelper.update({vdom, vnode: updatedVnode4});
        expect(updatedVnode5.childNodes.length).toBe(6);
    });

    test('Sorting', () => {
        let vdom = {
            id: 'root', cn: [
                {id: '0', html: 'g'},
                {id: '1', html: 'g'},
                {id: '2', html: 'g'},
                {id: '3', html: 'g'},
                {id: '4', html: 'm'},
                {id: '5', html: 'm'},
                {id: '6', html: 'w'},
                {id: '7', html: 'w'},
                {id: '8', html: 'w'},
                {id: '9', html: 'w'}
            ]
        };

        let { vnode } = VdomHelper.create({vdom});

        vdom.cn = [
            {id: '9', html: 'w'},
            {id: '8', html: 'w'},
            {id: '7', html: 'w'},
            {id: '6', html: 'w'},
            {id: '4', html: 'm'},
            {id: '5', html: 'm'},
            {id: '3', html: 'g'},
            {id: '2', html: 'g'},
            {id: '1', html: 'g'},
            {id: '0', html: 'g'}
        ];

        let { vnode: updatedVnode } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode.childNodes.map(c => c.id)).toEqual(['9', '8', '7', '6', '4', '5', '3', '2', '1', '0']);
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

    test('Replacing a parent node with multiple children & adding a new node', () => {
        let vdom = {id: 'level-1', cn: [{id: 'level-2', cn: [{id: 'level-3-1'}, {id: 'level-3-2'}]}]};
        let { vnode } = VdomHelper.create({vdom});

        vdom = {
            id: 'level-1', cn: [
                {id: 'level-3-1'},
                {id: 'new-node'},
                {id: 'level-3-2'}
            ]
        };

        let { deltas, vnode: updatedVnode } = VdomHelper.update({vdom, vnode});

        expect(updatedVnode.childNodes.length).toBe(3);
        expect(updatedVnode.childNodes[1].id).toBe('new-node');
        expect(deltas.length).toBe(4);
    });
});
