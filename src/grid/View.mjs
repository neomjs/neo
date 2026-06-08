import Base from '../container/Base.mjs';

/**
 * @class Neo.grid.View
 * @extends Neo.container.Base
 */
class View extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.View'
         * @protected
         */
        className: 'Neo.grid.View',
        /**
         * @member {String} ntype='grid-view'
         * @protected
         */
        ntype: 'grid-view',
        /**
         * @member {String[]} baseCls=['neo-grid-view', 'neo-hide-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-view', 'neo-hide-scrollbar'],
        /**
         * Back-reference to the owning grid.Container (the macro layer). grid.View orchestrates the
         * 1-3 bodies (`bodyStart`, `body`, `bodyEnd`) but reaches up to the container for macro state
         * it does not own — column distribution and the ScrollManager (horizontal scroll position plus
         * main-thread scroll/hover/pinning addon coordination).
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         * @protected
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The current scroll top position of the grid view
         * @member {Number} scrollTop_=0
         */
        scrollTop_: 0
    }

    /**
     * @returns {Object}
     */
    getVdomUpdateMeta() {
        return {
            scrollTop: this.scrollTop
        }
    }

    /**
     * Pushes synchronized scrolling coordinates (startIndex / scrollTop) into all active bodies
     * (`bodyStart`, `body`, `bodyEnd`). Owned here because grid.View is the body orchestrator; the
     * horizontal scroll position is read from the gridContainer macro layer, which retains the
     * ScrollManager.
     *
     * Preserves the row/cell pooling invariant: each body recomputes view data for a fixed node pool
     * via the silent `createViewData(true)` path — never inserting, removing, or moving DOM nodes
     * while scrolling.
     * @param {Number} scrollTop
     */
    syncBodies(scrollTop) {
        let me        = this,
            container = me.gridContainer,
            {body, bodyEnd, bodyStart, scrollManager} = container,
            {bufferRowRange, rowHeight} = body,
            newStartIndex = Math.floor(scrollTop / rowHeight);

        let updateBody = _body => {
            let isCenter = _body === body;
            _body.skipCreateViewData = true;

            _body.set({
                scrollLeft: isCenter ? scrollManager.scrollLeft : 0, // Horizontal sync applies from scrollManager state ONLY for center
                scrollTop : scrollTop
            });

            if (Math.abs(_body.startIndex - newStartIndex) >= bufferRowRange) {
                _body.startIndex = newStartIndex
            } else {
                _body.visibleRows[0] = newStartIndex;
                _body.visibleRows[1] = newStartIndex + _body.availableRows
            }

            _body.skipCreateViewData = false;
            _body.createViewData(true) // silent = true
        };

        updateBody(body);
        bodyStart && updateBody(bodyStart);
        bodyEnd   && updateBody(bodyEnd);

        me.scrollTop   = scrollTop;
        me.updateDepth = 3;
        me.update()
    }
}

export default Neo.setupClass(View);
