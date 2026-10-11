import {setup} from '../../setup.mjs';

setup({
    neoConfig: {useDomApiRenderer: true},
    appConfig: {name: 'HelperMoveOutOfMarkupTest'}
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * @summary A node whose content becomes markup (`html` or `text`) removes its old children by replacing them. When one
 * of them moves to a node the diff reaches later, its move must land first: `Neo.main.DeltaUpdates#moveNode` finds a
 * node by id, and a node the markup already replaced is detached.
 */
test.describe('VdomHelper — a child moving out of a node whose content becomes markup', () => {
    /**
     * @param {Object} from vdom
     * @param {Object} to vdom
     * @returns {String[]} each delta of the update as `action:id`, in order
     */
    const order = (from, to) => VdomHelper.update({vdom: to, vnode: VdomHelper.create({vdom: from}).vnode}).deltas
        .map(delta => `${delta.action || 'updateNode'}:${delta.id}`);

    for (const key of ['html', 'text']) {
        test(`the move lands before the ${key} that replaces its old parent's children`, () => {
            expect(order(
                {id: 'root', cn: [{id: 'cell1', cn: [{id: 'x', tag: 'input'}]}, {id: 'cell2', [key]: 'b'}]},
                {id: 'root', cn: [{id: 'cell1', [key]: 'a'}, {id: 'cell2', cn: [{id: 'x', tag: 'input'}]}]}
            )).toEqual(['updateNode:cell2', 'moveNode:x', 'updateNode:cell1'])
        })
    }

    test('markup over children that move nowhere keeps its place', () => {
        expect(order(
            {id: 'root', cn: [{id: 'cell1', cn: [{id: 'y', tag: 'span'}]}, {id: 'cell2', cn: [{id: 'z', tag: 'span'}]}]},
            {id: 'root', cn: [{id: 'cell1', html: 'a'}, {id: 'cell2', cn: [{id: 'z', tag: 'span', cls: ['moved']}]}]}
        )).toEqual(['updateNode:cell1', 'updateNode:z', 'removeNode:y'])
    })
});
