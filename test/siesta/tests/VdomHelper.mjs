import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import NeoArray        from '../../../src/util/Array.mjs';
import Style           from '../../../src/util/Style.mjs';
import StringFromVnode from '../../../src/vdom/util/StringFromVnode.mjs';
import VdomHelper      from '../../../src/vdom/Helper.mjs';
import VDomUtil        from '../../../src/util/VDom.mjs';

// tests are designed for this rendering mode
Neo.config.useDomApiRenderer = false;

let deltas, output, tmp, vdom, vnode;

StartTest(t => {
    t.it('Module imports', t => {
        t.ok(Neo,        'Neo is imported as a JS module');
        t.ok(VdomHelper, 'VdomHelper is imported as a JS module');
        t.ok(VDomUtil,   'VDomUtil is imported as a JS module');
    });

    t.it('Create Vnode', t => {
        vdom = {tag: 'div'};
        t.diag("VdomHelper.create({tag: div});");

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : [],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got created successfully');

        t.diag("VDomUtil.syncVdomIds(vnode, vdom);");
        VDomUtil.syncVdomIds(vnode, vdom);
        t.isStrict(vdom.id, 'neo-vnode-1', 'vdom id === neo-vnode-1');
    });

    t.it('Modify vdom.cls', t => {
        vdom.cls = ['neo-component'];
        t.diag("vdom.cls = ['neo-component'];");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-component'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {id: 'neo-vnode-1', cls: {add: ['neo-component']}
        }], 'deltas got created successfully');

        vdom.cls = ['neo-panel', 'neo-container', 'neo-component'];
        t.diag("vdom.cls = ['neo-panel', 'neo-container', 'neo-component'];");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-panel', 'neo-container', 'neo-component'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {id: 'neo-vnode-1', cls: {add: ['neo-panel', 'neo-container']}
        }], 'deltas got created successfully');

        vdom.cls = ['neo-container'];
        t.diag("vdom.cls = ['neo-container'];");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {id: 'neo-vnode-1', cls: {remove: ['neo-panel', 'neo-component']}
        }], 'deltas got created successfully');
    });

    t.it('Modify vdom.style', t => {
        vdom.style = {backgroundColor: 'red'};
        t.diag("vdom.style = {backgroundColor: 'red'};");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {backgroundColor: 'red'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id   : 'neo-vnode-1',
            style: {
                backgroundColor: 'red'
            }
        }], 'deltas got created successfully');

        vdom.style = {backgroundColor: 'red', color: 'green', height: '100px'};
        t.diag("vdom.style = {backgroundColor: 'red', color: 'green', height: '100px'};");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {backgroundColor: 'red', color: 'green', height: '100px'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id   : 'neo-vnode-1',
            style: {
                color : 'green',
                height: '100px'
            }
        }], 'deltas got created successfully');

        vdom.style = {color: 'green'};
        t.diag("vdom.style = {color: 'green'};");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id   : 'neo-vnode-1',
            style: {
                backgroundColor: null,
                height         : null
            }
        }], 'deltas got created successfully');
    });

    t.it('Modify vdom attributes', t => {
        vdom.tabIndex = -1;
        t.diag("vdom.tabIndex = -1;");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {tabIndex: '-1'},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id   : 'neo-vnode-1',
            attributes: {
                tabIndex: '-1'
            }
        }], 'deltas got created successfully');

        vdom.tabIndex = 0;
        t.diag("vdom.tabIndex = 0;");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {tabIndex: '0'},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id        : 'neo-vnode-1',
            attributes: {
                tabIndex: '0'
            }
        }], 'deltas got created successfully');

        delete vdom.tabIndex;
        t.diag("delete vdom.tabIndex;");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id        : 'neo-vnode-1',
            attributes: {
                tabIndex: null
            }
        }], 'deltas got created successfully');
    });

    t.it('Modify vdom cn', t => {
        vdom.cn = [{tag: 'div'}, {tag: 'div', id: 'neo-button-1'}, {tag: 'div'}];
        t.diag("vdom.cn = [{tag: 'div'}, {tag: 'div', id: 'neo-button-1'}, {tag: 'div'}];");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;
        VDomUtil.syncVdomIds(vnode, vdom);

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', index: 0, outerHTML: '<div id="neo-vnode-2"></div>',  parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 1, outerHTML: '<div id="neo-button-1"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', index: 2, outerHTML: '<div id="neo-vnode-3"></div>',  parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        tmp = vdom.cn[0]; vdom.cn[0] = vdom.cn[2]; vdom.cn[2] = tmp;
        t.diag("tmp = vdom.cn[0]; vdom.cn[0] = vdom.cn[2]; vdom.cn[2] = tmp;");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-vnode-3',  index: 0, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-button-1', index: 1, parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        vdom.cn.push(vdom.cn.shift()); // left shift
        t.diag("vdom.cn.push(vdom.cn.shift());");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-button-1', index: 0, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-vnode-2',  index: 1, parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        vdom.cn.unshift(vdom.cn.pop()); // right shift
        t.diag("vdom.cn.unshift(vdom.cn.pop());");

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-vnode-3', index: 0, parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');
    });

    t.it('vdom filtering (list.Base)', t => {
        t.diag("create list.Base with 6 items");

        vdom = {
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

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            nodeName  : 'ul',
            style     : {width: '100px'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__jsakalos',      innerHTML: 'Jozef',   nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__rwaters',       innerHTML: 'Rich',    nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got created successfully');

        t.diag("remove items at index: 2, 3, 4");

        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            nodeName  : 'ul',
            style     : {width: '100px'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-list-1__jsakalos'},
            {action: 'removeNode', id: 'neo-list-1__mrsunshine'},
            {action: 'removeNode', id: 'neo-list-1__rwaters'}
        ], 'deltas got created successfully');

        t.diag("recreate the 3 removed items");

        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Jozef',   id: 'neo-list-1__jsakalos',      tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Rich',    id: 'neo-list-1__rwaters',       tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            nodeName  : 'ul',
            style     : {width: '100px'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__jsakalos',      innerHTML: 'Jozef',   nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__rwaters',       innerHTML: 'Rich',    nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', index: 2, outerHTML: '<li class="neo-list-item" id="neo-list-1__jsakalos" tabIndex="-1">Jozef</li>',  parentId: 'neo-list-1'},
            {action: 'insertNode', index: 3, outerHTML: '<li class="neo-list-item" id="neo-list-1__mrsunshine" tabIndex="-1">Nils</li>', parentId: 'neo-list-1'},
            {action: 'insertNode', index: 4, outerHTML: '<li class="neo-list-item" id="neo-list-1__rwaters" tabIndex="-1">Rich</li>',    parentId: 'neo-list-1'}
        ], 'deltas got created successfully');

        t.diag("remove items at index: 2, 4, switch nils & tobi");

        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1}
        ];

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            nodeName  : 'ul',
            style     : {width: '100px'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'neo-list-1__tobiu', index: 3, parentId: 'neo-list-1'},
            {action: 'removeNode', id: 'neo-list-1__jsakalos'},
            {action: 'removeNode', id: 'neo-list-1__rwaters'}
        ], 'deltas got created successfully');

        t.diag("remove first list item");

        vdom.cn.splice(0, 1);

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode.childNodes, [
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'}
        ], 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'removeNode', id: 'neo-list-1__bhaustein'}
        ], 'deltas got created successfully');

        t.diag("restore the initial list state");

        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Jozef',   id: 'neo-list-1__jsakalos',      tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Rich',    id: 'neo-list-1__rwaters',       tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1}
        ];

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode.childNodes, [
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__jsakalos',      innerHTML: 'Jozef',   nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__rwaters',       innerHTML: 'Rich',    nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
        ], 'vnode got updated successfully');
    });

    t.it('Sorting', t => {
        t.diag("Creating a sorted array");

        vdom =
            {id: 'root', cn: [
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
        ]};

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'root',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: '0', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '1', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '2', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '3', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '4', innerHTML: 'm', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '5', innerHTML: 'm', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '6', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '7', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '8', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '9', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got created successfully');

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

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'root',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: '9', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '8', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '7', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '6', innerHTML: 'w', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '4', innerHTML: 'm', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '5', innerHTML: 'm', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '3', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '2', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '1', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: '0', innerHTML: 'g', nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        //console.log(deltas);
    });

    t.it('Replacing a parent node with one child', t => {
        t.diag("Creating the tree");

        vdom =
        {id: 'level-1', cn: [
            {id: 'level-2', cn: [
                {id: 'level-3'}
            ]}
        ]};

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'level-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes: [{
                id        : 'level-2',
                attributes: {},
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode',

                childNodes: [{
                    id        : 'level-3',
                    attributes: {},
                    childNodes: [],
                    className : [],
                    nodeName  : 'div',
                    style     : {},
                    vtype     : 'vnode'
                }]
            }]
        }, 'vnode got created successfully');

        // replace level 2 with level 3
        vdom.cn = vdom.cn[0].cn;

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'level-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes:[{
                id        : 'level-3',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }]
        }, 'vnode got updated successfully');

        t.is(deltas.length, 2, 'Count deltas equals 2');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'level-3', index: 1, parentId: 'level-1'},
            {action: 'removeNode', id: 'level-2'}
        ], 'deltas got created successfully');
    });

    t.it('Replacing a parent node with multiple children', t => {
        t.diag("Creating the tree");

        vdom =
        {id: 'level-1', cn: [
            {id: 'level-2', cn: [
                {id: 'level-3-1'},
                {id: 'level-3-2'}
            ]}
        ]};

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'level-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes: [{
                id        : 'level-2',
                attributes: {},
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode',

                childNodes: [{
                    id        : 'level-3-1',
                    attributes: {},
                    childNodes: [],
                    className : [],
                    nodeName  : 'div',
                    style     : {},
                    vtype     : 'vnode'
                }, {
                    id        : 'level-3-2',
                    attributes: {},
                    childNodes: [],
                    className : [],
                    nodeName  : 'div',
                    style     : {},
                    vtype     : 'vnode'
                }]
            }]
        }, 'vnode got created successfully');

        // replace level 2 with level 3
        vdom.cn = vdom.cn[0].cn;

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'level-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes:[{
                id        : 'level-3-1',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }, {
                id        : 'level-3-2',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'level-3-1', index: 1, parentId: 'level-1'},
            {action: 'moveNode',   id: 'level-3-2', index: 2, parentId: 'level-1'},
            {action: 'removeNode', id: 'level-2'}
        ], 'deltas got created successfully');
    });

    t.it('Replacing a parent node with multiple children & adding a new node', t => {
        t.diag("Creating the tree");

        vdom =
        {id: 'level-1', cn: [
            {id: 'level-2', cn: [
                {id: 'level-3-1'},
                {id: 'level-3-2'}
            ]}
        ]};

        output = VdomHelper.create({vdom}); vnode = output.vnode;

        vdom =
        {id: 'level-1', cn: [
            {id: 'level-3-1'},
            {id: 'new-node'},
            {id: 'level-3-2'}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : [],
            id        : 'level-1',
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode',

            childNodes:[{
                id        : 'level-3-1',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }, {
                id        : 'new-node',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }, {
                id        : 'level-3-2',
                attributes: {},
                childNodes: [],
                className : [],
                nodeName  : 'div',
                style     : {},
                vtype     : 'vnode'
            }]
        }, 'vnode got updated successfully');

        t.is(deltas.length, 4, 'Count deltas equals 4');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'level-3-1', index: 1, parentId: 'level-1'},
            {action: 'insertNode',                  index: 2, parentId: 'level-1', outerHTML: t.any(String)},
            {action: 'moveNode',   id: 'level-3-2', index: 3, parentId: 'level-1'},
            {action: 'removeNode', id: 'level-2'}
        ], 'deltas got created successfully');
    });
});
