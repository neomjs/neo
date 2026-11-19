import {setup} from '../../../setup.mjs';

const appName = 'TreeSortZoneTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Instance       from '../../../../../src/manager/Instance.mjs';
import SortZone       from '../../../../../src/draggable/tree/SortZone.mjs';
import TreeList       from '../../../../../src/tree/List.mjs';

/**
 * @summary Neo.draggable.tree.SortZone moves a tree's records between items and into folders.
 *
 * The tree renders from the store: among siblings, store order is tree order. So every arm reads the result from the
 * records (`parentId`, the store order of a folder's children) and from the rendered vdom.
 *
 *     docs (open)    a, b, sub (open) > c
 *     music (closed) d
 *     e
 */

let tree, zone;

/**
 * @returns {Neo.tree.List}
 */
function createTree() {
    return Neo.create(TreeList, {
        appName,
        id                        : 'tree-sort-zone',
        showCollapseExpandAllIcons: false,
        store: {
            model: {
                fields: [
                    {name: 'id',        type: 'String'},
                    {name: 'name',      type: 'String'},
                    {name: 'parentId',  type: 'String'},
                    {name: 'isLeaf',    type: 'Boolean'},
                    {name: 'collapsed', type: 'Boolean'}
                ]
            },
            data: [
                {id: 'docs',  name: 'docs',  parentId: null,    isLeaf: false, collapsed: false},
                {id: 'a',     name: 'a',     parentId: 'docs',  isLeaf: true},
                {id: 'b',     name: 'b',     parentId: 'docs',  isLeaf: true},
                {id: 'sub',   name: 'sub',   parentId: 'docs',  isLeaf: false, collapsed: false},
                {id: 'c',     name: 'c',     parentId: 'sub',   isLeaf: true},
                {id: 'music', name: 'music', parentId: null,    isLeaf: false, collapsed: true},
                {id: 'd',     name: 'd',     parentId: 'music', isLeaf: true},
                {id: 'e',     name: 'e',     parentId: null,    isLeaf: true}
            ]
        }
    })
}

/**
 * The keys of a parent's children, in store order, which is the order the tree renders them in
 * @param {String|null} parentId
 * @returns {String[]}
 */
const children = parentId => tree.store.find('parentId', parentId).map(record => record.id);

/**
 * The keys of the items the vdom renders directly below a folder's item, or at the root
 * @param {String|null} parentId
 * @returns {String[]}
 */
function renderedChildren(parentId) {
    let root = tree.getListItemsRoot(),
        list = root,
        cn, index;

    if (parentId !== null) {
        cn    = findParentCn(root, tree.getItemId(parentId));
        index = cn.findIndex(node => node.id === tree.getItemId(parentId));
        list  = cn[index + 1]?.tag === 'ul' ? cn[index + 1] : {cn: []}
    }

    return list.cn.filter(node => node.tag === 'li').map(node => node.id.split('__')[1])
}

/**
 * @param {Object} node
 * @param {String} id
 * @returns {Object[]|null} The child array that holds the node with `id`
 */
function findParentCn(node, id) {
    if (node.cn?.some(child => child.id === id)) {
        return node.cn
    }

    for (const child of node.cn || []) {
        const result = findParentCn(child, id);

        if (result) {
            return result
        }
    }

    return null
}

/**
 * The hit test a pointer over an item produces: the item with its rect, innermost first, then the tree
 * @param {String} key
 * @param {Number} offset The pointer's position from the item's top, as a share of its height
 * @returns {Object}
 */
function pointerOver(key, offset) {
    return {
        clientY   : 100 + offset * 40,
        targetPath: [
            {cls: [tree.itemCls], id: tree.getItemId(key), rect: {height: 40, top: 100}},
            {cls: ['neo-tree-list'], id: tree.id}
        ]
    }
}

test.describe('Neo.draggable.tree.SortZone', () => {
    test.beforeEach(async () => {
        tree = createTree();
        await tree.initVnode();

        zone = Neo.create(SortZone, {appName, owner: tree});
        tree.sortZone       = zone;
        tree.dragResortable = true
    });

    test.afterEach(() => {
        zone.destroy();
        tree.destroy()
    });

    test('a leaf moves into a folder as its last child', () => {
        let events = [];

        zone.on('move', data => events.push(data));

        expect(zone.moveRecord(tree.store.get('a'), tree.store.get('sub'), 'inside')).toBe(true);

        expect(tree.store.get('a').parentId).toBe('sub');
        expect(children('sub')).toEqual(['c', 'a']);
        expect(children('docs')).toEqual(['b', 'sub']);
        expect(renderedChildren('sub')).toEqual(['c', 'a']);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({oldParentId: 'docs', parentId: 'sub', position: 'inside'})
    });

    test('a leaf moves between two items of another folder, and within its own', () => {
        expect(zone.moveRecord(tree.store.get('e'), tree.store.get('b'), 'before')).toBe(true);
        expect(tree.store.get('e').parentId).toBe('docs');
        expect(children('docs')).toEqual(['a', 'e', 'b', 'sub']);
        expect(children(null)).toEqual(['docs', 'music']);

        expect(zone.moveRecord(tree.store.get('a'), tree.store.get('b'), 'after')).toBe(true);
        expect(children('docs')).toEqual(['e', 'b', 'a', 'sub']);
        expect(renderedChildren('docs')).toEqual(['e', 'b', 'a', 'sub'])
    });

    test('a folder moves with its subtree', () => {
        expect(zone.moveRecord(tree.store.get('sub'), tree.store.get('e'), 'before')).toBe(true);

        expect(children(null)).toEqual(['docs', 'music', 'sub', 'e']);
        expect(children('sub')).toEqual(['c']);
        expect(renderedChildren('sub')).toEqual(['c'])
    });

    test('a folder never moves into itself or its subtree, and a move to its own place changes nothing', () => {
        let docs  = tree.store.get('docs'),
            order = tree.store.items.map(record => record.id);

        expect(zone.isAncestor(docs, tree.store.get('c'))).toBe(true);
        expect(zone.isAncestor(tree.store.get('sub'), tree.store.get('a'))).toBe(false);

        expect(zone.moveRecord(docs, tree.store.get('c'),   'before')).toBe(false);
        expect(zone.moveRecord(docs, tree.store.get('sub'), 'inside')).toBe(false);
        expect(zone.moveRecord(docs, docs,                  'inside')).toBe(false);
        expect(zone.moveRecord(tree.store.get('a'), tree.store.get('b'), 'before')).toBe(false);
        expect(zone.moveRecord(tree.store.get('a'), tree.store.get('b'), 'inside')).toBe(false);

        expect(tree.store.items.map(record => record.id)).toEqual(order);
        expect(docs.parentId).toBe(null)
    });

    test('the slot comes from the item under the pointer', () => {
        zone.onDragMove({}); // no drag running: nothing happens

        expect(zone.getSlot(pointerOver('b', .3))).toEqual({position: 'before', target: tree.store.get('b')});
        expect(zone.getSlot(pointerOver('b', .7))).toEqual({position: 'after',  target: tree.store.get('b')});

        // An open folder takes the record in below its top quarter, a closed one has a gap after it
        expect(zone.getSlot(pointerOver('sub',   .1)).position).toBe('before');
        expect(zone.getSlot(pointerOver('sub',   .5)).position).toBe('inside');
        expect(zone.getSlot(pointerOver('sub',   .9)).position).toBe('inside');
        expect(zone.getSlot(pointerOver('music', .9)).position).toBe('after');

        // Outside the tree, and over anything that is no item
        expect(zone.getSlot({clientY: 0, targetPath: [{id: 'elsewhere'}]})).toBe(null);
        expect(zone.getSlot({clientY: 0, targetPath: [{cls: ['neo-list'], id: 'ul-1'}, {id: tree.id}]})).toBe(undefined)
    });

    test('a re-render keeps the drag handle and the folders a method opened or closed', () => {
        tree.collapseAll();
        expect(tree.store.get('docs').collapsed).toBe(true);
        expect(tree.store.get('sub').collapsed).toBe(true);

        tree.expandParents('c');
        expect(tree.store.get('docs').collapsed).toBe(false);
        expect(tree.store.get('sub').collapsed).toBe(false);
        expect(tree.store.get('music').collapsed).toBe(true);

        zone.moveRecord(tree.store.get('e'), tree.store.get('a'), 'before');

        expect(tree.getVdomChild(tree.getItemId('docs')).cls).toContain('neo-folder-open');
        expect(tree.getVdomChild(tree.getItemId('music')).cls).not.toContain('neo-folder-open');
        expect(tree.getVdomChild(tree.getItemId('e')).cls).toContain('neo-draggable');

        zone.leafNodesOnly = true;
        tree.createItems();

        expect(tree.getVdomChild(tree.getItemId('docs')).cls).not.toContain('neo-draggable');
        expect(tree.getVdomChild(tree.getItemId('e')).cls).toContain('neo-draggable')
    })
});
