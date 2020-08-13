import Neo                     from '../../../src/Neo.mjs';
import * as core               from '../../../src/core/_export.mjs';
import NeoArray                from '../../../src/util/Array.mjs';
import Style                   from '../../../src/util/Style.mjs';
import {default as VdomHelper} from '../../../src/vdom/Helper.mjs';
import {default as VDomUtil}   from '../../../src/util/VDom.mjs';

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

        vnode = VdomHelper.create(vdom);

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : [],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            outerHTML : '<div id="neo-vnode-1"></div>', // will only get created using VdomHelper.create()
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-component'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id : 'neo-vnode-1',
            cls: {
                add   : ['neo-component'],
                remove: []
            }
        }], 'deltas got created successfully');

        vdom.cls = ['neo-panel', 'neo-container', 'neo-component'];
        t.diag("vdom.cls = ['neo-panel', 'neo-container', 'neo-component'];");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-panel', 'neo-container', 'neo-component'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id : 'neo-vnode-1',
            cls: {
                add   : ['neo-panel', 'neo-container'],
                remove: []
            }
        }], 'deltas got created successfully');

        vdom.cls = ['neo-container'];
        t.diag("vdom.cls = ['neo-container'];");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {},
            vtype     : 'vnode'
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [{
            id : 'neo-vnode-1',
            cls: {
                add   : [],
                remove: ['neo-panel', 'neo-component']
            }
        }], 'deltas got created successfully');
    });

    t.it('Modify vdom.style', t => {
        vdom.style = {backgroundColor: 'red'};
        t.diag("vdom.style = {backgroundColor: 'red'};");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {tabIndex: '-1'},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {tabIndex: '0'},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            childNodes: [],
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;
        VDomUtil.syncVdomIds(vnode, vdom);

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',
            
            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-vnode-2',  index: 0, outerHTML: '<div id="neo-vnode-2"></div>',  parentId: 'neo-vnode-1'},
            {action: 'insertNode', id: 'neo-button-1', index: 1, outerHTML: '<div id="neo-button-1"></div>', parentId: 'neo-vnode-1'},
            {action: 'insertNode', id: 'neo-vnode-3',  index: 2, outerHTML: '<div id="neo-vnode-3"></div>',  parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        tmp = vdom.cn[0]; vdom.cn[0] = vdom.cn[2]; vdom.cn[2] = tmp;
        t.diag("tmp = vdom.cn[0]; vdom.cn[0] = vdom.cn[2]; vdom.cn[2] = tmp;");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-vnode-3', index: 0, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-vnode-2', index: 2, parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        vdom.cn.push(vdom.cn.shift()); // left shift
        t.diag("vdom.cn.push(vdom.cn.shift());");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-button-1', index: 0, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-vnode-2',  index: 1, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-vnode-3',  index: 2, parentId: 'neo-vnode-1'}
        ], 'deltas got created successfully');

        vdom.cn.unshift(vdom.cn.pop()); // right shift
        t.diag("vdom.cn.unshift(vdom.cn.pop());");

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-container'],
            id        : 'neo-vnode-1',
            innerHTML : undefined,
            nodeName  : 'div',
            style     : {color: 'green'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-3',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-button-1', innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'},
                {attributes: {}, childNodes: [], className: [], id: 'neo-vnode-2',  innerHTML: undefined, nodeName: 'div', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-vnode-3',  index: 0, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-button-1', index: 1, parentId: 'neo-vnode-1'},
            {action: 'moveNode', id: 'neo-vnode-2',  index: 2, parentId: 'neo-vnode-1'}
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

        vnode = VdomHelper.create(vdom);

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            innerHTML : undefined,
            nodeName  : 'ul',
            outerHTML : '<ul style="width:100px;" class="neo-list-container neo-list" id="neo-list-1"><li class="neo-list-item" id="neo-list-1__bhaustein" tabIndex="-1">Bastian</li><li class="neo-list-item" id="neo-list-1__camtnbikerrwc" tabIndex="-1">Gerard</li><li class="neo-list-item" id="neo-list-1__jsakalos" tabIndex="-1">Jozef</li><li class="neo-list-item" id="neo-list-1__mrsunshine" tabIndex="-1">Nils</li><li class="neo-list-item" id="neo-list-1__rwaters" tabIndex="-1">Rich</li><li class="neo-list-item" id="neo-list-1__tobiu" tabIndex="-1">Tobias</li></ul>',
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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            innerHTML : undefined,
            nodeName  : 'ul',
            style     : {width: '100px'},
            vtype     : 'vnode',

            childNodes: [
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
                {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
            ]
        }, 'vnode got updated successfully');

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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            innerHTML : undefined,
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

        t.isDeeplyStrict(deltas, [
            {action: 'insertNode', id: 'neo-list-1__jsakalos',   index: 2, outerHTML: '<li class="neo-list-item" id="neo-list-1__jsakalos" tabIndex="-1">Jozef</li>',  parentId: 'neo-list-1'},
            {action: 'insertNode', id: 'neo-list-1__mrsunshine', index: 3, outerHTML: '<li class="neo-list-item" id="neo-list-1__mrsunshine" tabIndex="-1">Nils</li>', parentId: 'neo-list-1'},
            {action: 'insertNode', id: 'neo-list-1__rwaters',    index: 4, outerHTML: '<li class="neo-list-item" id="neo-list-1__rwaters" tabIndex="-1">Rich</li>',    parentId: 'neo-list-1'}
        ], 'deltas got created successfully');

        t.diag("remove items at index: 2, 4, switch nils & tobi");

        vdom.cn = [
            {tag: 'li', cls: ['neo-list-item'], html: 'Bastian', id: 'neo-list-1__bhaustein',     tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Gerard',  id: 'neo-list-1__camtnbikerrwc', tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Tobias',  id: 'neo-list-1__tobiu',         tabIndex: -1},
            {tag: 'li', cls: ['neo-list-item'], html: 'Nils',    id: 'neo-list-1__mrsunshine',    tabIndex: -1}
        ];

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode, {
            attributes: {},
            className : ['neo-list-container', 'neo-list'],
            id        : 'neo-list-1',
            innerHTML : undefined,
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

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode',   id: 'neo-list-1__tobiu', index: 2, parentId: 'neo-list-1'},
            {action: 'removeNode', id: 'neo-list-1__jsakalos'},
            {action: 'removeNode', id: 'neo-list-1__rwaters'}
        ], 'deltas got created successfully');

        t.diag("remove first list item");

        vdom.cn.splice(0, 1);

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

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

        output = VdomHelper.update({vdom: vdom, vnode: vnode}); deltas = output.deltas; vnode = output.vnode;

        t.isDeeplyStrict(vnode.childNodes, [
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__bhaustein',     innerHTML: 'Bastian', nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__camtnbikerrwc', innerHTML: 'Gerard',  nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__jsakalos',      innerHTML: 'Jozef',   nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__mrsunshine',    innerHTML: 'Nils',    nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__rwaters',       innerHTML: 'Rich',    nodeName: 'li', style: {}, vtype: 'vnode'},
            {attributes: {tabIndex: '-1'}, childNodes: [], className: ['neo-list-item'], id: 'neo-list-1__tobiu',         innerHTML: 'Tobias',  nodeName: 'li', style: {}, vtype: 'vnode'}
        ], 'vnode got updated successfully');

        // console.log(deltas);
    });
});