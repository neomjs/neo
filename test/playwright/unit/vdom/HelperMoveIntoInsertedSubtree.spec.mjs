import {setup} from '../../setup.mjs';

setup({
    neoConfig: {useDomApiRenderer: false},
    appConfig: {name: 'HelperMoveIntoInsertedSubtreeTest'}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

/**
 * @summary A node the diff moves into a freshly inserted subtree is left out of that subtree's markup and follows as
 * its own `moveNode`. `Neo.main.DeltaUpdates#moveNode` inserts before `childNodes[index]`, a DOM index, and a text
 * child renders as three DOM nodes (its two comment wrappers and the text), so the move must carry the physical index.
 */
test.describe('VdomHelper — a node moving into a freshly inserted subtree', () => {
    const handle = {tag: 'span', id: 'handle', text: '⠿'};

    /**
     * @param {Object[]} newLabelChildren the inserted label's children, `handle` among them
     * @returns {Object[]} the update's deltas
     */
    function moveIntoNewLabel(newLabelChildren) {
        const {vnode} = VdomHelper.create({vdom: {id: 'root', cn: [
            {id: 'old-label', tag: 'span', cn: [Neo.clone(handle)]},
            {id: 'new-home'}
        ]}});

        return VdomHelper.update({vnode, vdom: {id: 'root', cn: [
            {id: 'old-label', tag: 'span', cn: []},
            {id: 'new-home', cn: [{id: 'new-label', tag: 'span', cn: newLabelChildren}]}
        ]}}).deltas
    }

    test('after a text child, the move lands behind the text\'s closing comment', () => {
        const deltas = moveIntoNewLabel([{vtype: 'text', id: 'label-text', text: 'Metrics'}, Neo.clone(handle)]);

        expect(deltas.find(delta => delta.action === 'moveNode')).toEqual(
            {action: 'moveNode', id: 'handle', index: 3, parentId: 'new-label'}
        )
    });

    test('before a text child, the move keeps index 0', () => {
        const deltas = moveIntoNewLabel([Neo.clone(handle), {vtype: 'text', id: 'label-text', text: 'Metrics'}]);

        expect(deltas.find(delta => delta.action === 'moveNode')).toEqual(
            {action: 'moveNode', id: 'handle', index: 0, parentId: 'new-label'}
        )
    })
});
