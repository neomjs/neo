import GridBody from '../grid/Body.mjs';

/**
 * @summary Grid body that retains its Gantt dependency overlay alongside row components.
 * @class Neo.gantt.Body
 * @extends Neo.grid.Body
 */
class Body extends GridBody {
    static config = {
        /**
         * @member {String} className='Neo.gantt.Body'
         * @protected
         */
        className: 'Neo.gantt.Body',
        /**
         * @member {String} ntype='gantt-body'
         * @protected
         */
        ntype: 'gantt-body'
    }

    /**
     * @summary Mounts the chart's {@link Neo.gantt.DependencyLayer} after the center body's pooled rows.
     */
    createRowPool() {
        super.createRowPool();

        if (this !== this.gridContainer?.body) {
            return
        }

        let layer  = this.gridContainer.ensureDependencyLayer(),
            rootCn = this.getVdomRoot()?.cn;

        if (layer && Array.isArray(rootCn) && !rootCn.some(node => node?.componentId === layer.id)) {
            rootCn.push(layer.createVdomReference())
        }
    }

    /**
     * @summary Keeps the overlay on the center body's scroll page and retires a recycled link source.
     * @param {Boolean} [silent=false] True to suppress the final VDOM update, passed on to the grid body
     * @param {Boolean} [force=false]  True to update rows whose record did not change, passed on to the grid body
     */
    createViewData(silent=false, force=false) {
        super.createViewData(silent, force);
        let chart = this.gridContainer;
        if (this === chart?.body) {
            chart.dependencyLayer?.syncScrollPage(this);
            chart.checkKeyboardLinkSource()
        }
    }

    /**
     * @summary Moving between the timeline's bars keeps their common body focused. Leaving it ends the gesture.
     * @param {Object} data The focus-leave event data, passed on to the grid body
     */
    onFocusLeave(data) {
        super.onFocusLeave(data);
        if (this === this.gridContainer?.body) this.gridContainer.cancelKeyboardLink()
    }
}

export default Neo.setupClass(Body);
