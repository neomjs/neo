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

    /** @summary Keeps the overlay on the center body's scroll page and retires a recycled link source. */
    createViewData(silent=false, force=false) {
        super.createViewData(silent, force);
        const chart = this.gridContainer;
        if (this === chart?.body) {
            chart.dependencyLayer?.syncScrollPage?.(this);
            chart.checkKeyboardLinkSource()
        }
    }

    /** @summary Moving between the timeline's bars keeps their common body focused. Leaving it ends the gesture. */
    onFocusLeave(data) {
        super.onFocusLeave(data);
        if (this === this.gridContainer?.body) this.gridContainer.cancelKeyboardLink()
    }

    /**
     * @summary Appends a VDOM component reference (`{componentId}`) for the owning Gantt's
     * {@link Neo.gantt.DependencyLayer} after the pooled row references without touching `rowMeasureVdom`.
     */
    createRowPool() {
        super.createRowPool();

        if (this !== this.gridContainer?.body) {
            return
        }

        const
            layer  = this.gridContainer.ensureDependencyLayer?.(),
            rootCn = this.getVdomRoot()?.cn;

        if (layer && Array.isArray(rootCn) && !rootCn.some(node => node?.componentId === layer.id)) {
            rootCn.push(layer.createVdomReference())
        }
    }
}

export default Neo.setupClass(Body);
