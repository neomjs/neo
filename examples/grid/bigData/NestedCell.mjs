import Component from '../../../src/component/Base.mjs';
import Container from '../../../src/container/Base.mjs';

/**
 * A cell component that owns a child component, rather than rendering the record itself.
 *
 * `grid.column.Component` places no constraint on the module a cell uses, so a cell is free to be a
 * container whose children carry the record-derived content. That shape sits one component boundary
 * further from `grid.View` than a flat cell does, which is exactly what the scroll update has to
 * reach — so the example carries it deliberately, and `ComponentCellScrollSync.spec.mjs` asserts the
 * nested label follows its record across a recycle.
 *
 * @class Neo.examples.grid.bigData.NestedCell
 * @extends Neo.container.Base
 */
class NestedCell extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.NestedCell'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.NestedCell',
        /**
         * @member {String[]} cls=['bigdata-nested-cell']
         */
        cls: ['bigdata-nested-cell'],
        /**
         * The record-derived value. Assigned on every recycle by the column's `component` function,
         * and forwarded to the child, which is what actually renders it.
         * @member {String|null} firstname_=null
         * @reactive
         */
        firstname_: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            cls   : ['bigdata-nested-cell-label'],
            vdom  : {tag: 'span'}
        }],
        /**
         * @member {Object} layout={ntype:'base'}
         */
        layout: {ntype: 'base'}
    }

    /**
     * Applies the current value to the child. Called from both entry points, because the two happen in
     * the opposite order depending on where the value comes from: a recycle assigns `firstname` to a
     * container whose child already exists, while construction assigns it before `createItems()` has
     * run and `items[0]` is still a config object.
     * @param {String|null} value
     * @private
     */
    #applyLabel(value) {
        let label = this.items?.[0];

        // Not a component yet — construction has not reached createItems(). onConstructed() re-applies.
        if (typeof label?.update !== 'function') {
            return
        }

        label.vdom.text = value ? `${value} **` : '';

        // Deliberately no `label.update()`. `silentVdomUpdate` is per-component: the silent
        // `component.set()` of a scroll recycle silences THIS cell, never its children, so a child that
        // updates itself leaves the row's transaction and repaints on its own schedule — which tears
        // under rapid scrolling. Mutating the child's vdom and leaving the update to the owning cycle is
        // what keeps a nested cell atomic. Outside a recycle the cell's own update covers the child too.
        this.update()
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetFirstname(value, oldValue) {
        this.#applyLabel(value)
    }

    /**
     * `super.onConstructed()` runs `createItems()`, so this is the first point where the child exists.
     */
    onConstructed() {
        super.onConstructed();
        this.#applyLabel(this.firstname)
    }
}

export default Neo.setupClass(NestedCell);
