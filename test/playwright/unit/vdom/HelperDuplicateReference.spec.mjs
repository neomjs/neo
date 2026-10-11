import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'HelperDuplicateReferenceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

/**
 * A diff must terminate on any old tree it is given. `createDeltas` removes a child the new tree dropped and then
 * revisits the same index, which is only safe if the removal shrank the array being iterated. A component referenced
 * from two parents of the old tree breaks that: the vnode map keeps ONE of the two parents, and removing from the
 * mapped parent leaves the iterated one unchanged — the loop re-removes the same child until the VDom worker throws
 * `RangeError: Invalid array length`, as a warm reload of a two-root Workstation did.
 *
 * The removal count is capped so a regression fails in milliseconds instead of exhausting the worker's memory.
 */
test.describe('Neo.vdom.Helper — a duplicated component reference in the old tree', () => {
    /**
     * @summary A plain element vnode as the Helper stores it.
     * @param {String} id
     * @param {Object[]} [childNodes=[]]
     * @returns {Object}
     */
    const element = (id, childNodes=[]) => ({attributes: {}, childNodes, className: [], id, nodeName: 'div', style: {}, vtype: 'vnode'});

    /**
     * @summary Runs one update with `removeNode` capped, so a non-terminating diff fails fast.
     * @param {Object} vdom
     * @param {Object} vnode
     * @returns {Object} the update result
     */
    function boundedUpdate(vdom, vnode) {
        const original = VdomHelper.removeNode;
        let   calls    = 0;

        VdomHelper.removeNode = function(...args) {
            if (++calls > 100) {
                throw new Error(`removeNode did not terminate: ${calls} calls`)
            }

            return original.apply(this, args)
        };

        try {
            return VdomHelper.update({vdom, vnode})
        } finally {
            VdomHelper.removeNode = original
        }
    }

    test('dropping a component referenced from two parents terminates and removes it from both', () => {
        const vnode = element('root', [element('a', [{componentId: 'dup'}]), element('b', [{componentId: 'dup'}])]),
              vdom  = {id: 'root', cn: [{id: 'a', cn: []}, {id: 'b', cn: []}]};

        const {deltas} = boundedUpdate(vdom, vnode);

        expect(deltas.filter(delta => delta.action === 'removeNode' && delta.id === 'dup')).toHaveLength(2)
    });

    test('control: the same component referenced from one parent is removed once', () => {
        const vnode = element('root', [element('a', [{componentId: 'solo'}]), element('b')]),
              vdom  = {id: 'root', cn: [{id: 'a', cn: []}, {id: 'b', cn: []}]};

        const {deltas} = boundedUpdate(vdom, vnode);

        expect(deltas.filter(delta => delta.action === 'removeNode' && delta.id === 'solo')).toHaveLength(1)
    });
});
