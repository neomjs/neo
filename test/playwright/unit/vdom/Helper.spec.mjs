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
import Registry        from '../../../../src/vdom/util/DeltaCoherenceRegistry.mjs';

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

    test('a stale cross-batch insert rebases only after the prior projection was applied', () => {
        const
            baselineVdom = {
                id: 'ack-root', cn: [{id: 'ack-before', html: 'before'}]
            },
            firstVdom = {
                id: 'ack-root', cn: [{id: 'ack-node', cls: ['first'], html: 'A'}]
            },
            latestVdom = {
                id: 'ack-root', cn: [{id: 'ack-node', cls: ['latest'], html: 'B'}]
            },
            baseline = VdomHelper.create({vdom: baselineVdom}).vnode,
            // Helper deliberately mutates the supplied old tree while calculating a batch. Real
            // concurrent flights captured independent snapshots, so the reproduction must too.
            first    = VdomHelper.update({vdom: firstVdom,  vnode: structuredClone(baseline)}),
            stale    = VdomHelper.update({vdom: latestVdom, vnode: structuredClone(baseline)});

        Registry.clear();

        const firstEvaluation = Registry.evaluateBatch(first.deltas);

        expect(firstEvaluation.findings).toEqual([]);
        firstEvaluation.commit(); // Main applied A; only now may A.vnode become the next baseline.

        const staleFindings = Registry.evaluateBatch(stale.deltas).findings;

        expect(staleFindings.map(finding => finding.rule)).toContain('C-insert');

        const rebased = VdomHelper.update({vdom: latestVdom, vnode: first.vnode});

        expect(rebased.deltas.some(delta => delta.action === 'insertNode')).toBe(false);
        expect(rebased.deltas.some(delta => (delta.action || 'updateNode') === 'updateNode' && delta.id === 'ack-node'))
            .toBe(true);
        expect(Registry.evaluateBatch(rebased.deltas).findings).toEqual([]);

        // Cross-parent is the same boundary with one extra structural fact: keep the live node,
        // move it, then update it from the newest vdom. Replacing it would lose live control state.
        const
            parentBaselineVdom = {
                id: 'move-root', cn: [{id: 'move-left'}, {id: 'move-right'}]
            },
            parentFirstVdom = {
                id: 'move-root', cn: [
                    {id: 'move-left',  cn: [{id: 'move-node', cls: ['first'], html: 'A'}]},
                    {id: 'move-right'}
                ]
            },
            parentLatestVdom = {
                id: 'move-root', cn: [
                    {id: 'move-left'},
                    {id: 'move-right', cn: [{id: 'move-node', cls: ['latest'], html: 'B'}]}
                ]
            },
            parentBaseline = VdomHelper.create({vdom: parentBaselineVdom}).vnode,
            parentFirst    = VdomHelper.update({vdom: parentFirstVdom, vnode: parentBaseline}),
            parentRebased  = VdomHelper.update({vdom: parentLatestVdom, vnode: parentFirst.vnode});

        expect(parentRebased.deltas).toEqual(expect.arrayContaining([
            expect.objectContaining({action: 'moveNode', id: 'move-node', parentId: 'move-right'})
        ]));
        expect(parentRebased.deltas.some(delta =>
            (delta.action || 'updateNode') === 'updateNode' && delta.id === 'move-node'
        )).toBe(true);
        expect(parentRebased.deltas.some(delta => delta.action === 'insertNode')).toBe(false);

        // Abort control: evaluating A is not applying A. Without its commit receipt the live tree
        // still is O, so B must remain a legal insert and no C-insert finding may be manufactured.
        Registry.clear();
        Registry.evaluateBatch(first.deltas); // deliberately discard commit()

        const afterAbort = VdomHelper.update({vdom: latestVdom, vnode: structuredClone(baseline)});

        expect(afterAbort.deltas.some(delta => delta.action === 'insertNode')).toBe(true);
        expect(Registry.evaluateBatch(afterAbort.deltas).findings).toEqual([]);

        Registry.clear()
    });

    test('the coherence flag adds exact update-owner ranges without changing deltas', () => {
        const previous = Neo.config.useDeltaCoherenceRegistry;

        Neo.config.useDeltaCoherenceRegistry = true;

        try {
            const
                alphaOld = VdomHelper.create({vdom: {id: 'owner-alpha'}}).vnode,
                betaOld  = VdomHelper.create({vdom: {id: 'owner-beta', cls: ['before']}}).vnode,
                response = VdomHelper.updateBatch({coherenceAcknowledgments: [
                    {ownerId: 'prior-alpha', sequence: 5},
                    {ownerId: 'prior-beta', sequence: 7}
                ], updates: {
                    'alpha-component': {
                        vdom : {id: 'owner-alpha', cn: [{id: 'owner-alpha-child'}]},
                        vnode: alphaOld
                    },
                    'beta-component': {
                        vdom : {id: 'owner-beta', cls: ['after']},
                        vnode: betaOld
                    }
                }});

            expect(response.deltas).toHaveLength(2);
            expect(response.coherenceBatches).toEqual([
                expect.objectContaining({
                    acknowledgments: [
                        {ownerId: 'prior-alpha', sequence: 5},
                        {ownerId: 'prior-beta', sequence: 7}
                    ],
                    end: 1, ownerId: 'alpha-component', start: 0
                }),
                expect.objectContaining({
                    acknowledgments: [
                        {ownerId: 'prior-alpha', sequence: 5},
                        {ownerId: 'prior-beta', sequence: 7}
                    ],
                    end: 2, ownerId: 'beta-component', start: 1
                })
            ]);
            expect(response.coherenceBatches[0].sequence).toBeGreaterThan(0);
            expect(response.coherenceBatches[1].sequence).toBe(response.coherenceBatches[0].sequence);
            expect(response.coherenceSequence).toBe(response.coherenceBatches[0].sequence)
        } finally {
            Neo.config.useDeltaCoherenceRegistry = previous
        }
    });
});
