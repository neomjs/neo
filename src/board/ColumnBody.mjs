import Container from '../container/Base.mjs';

/**
 * @summary A column's scroll surface: spacer nodes surround a separate root containing only card components.
 * @class Neo.board.ColumnBody
 * @extends Neo.container.Base
 */
class ColumnBody extends Container {
    static config = {
        /**
         * @member {String} className='Neo.board.ColumnBody'
         * @protected
         */
        className: 'Neo.board.ColumnBody',
        /**
         * @member {String} ntype='board-column-body'
         * @protected
         */
        ntype: 'board-column-body',
        /**
         * @member {Object} _vdom
         * @protected
         */
        _vdom: {cn: [
            {cls: ['neo-board-spacer'], 'aria-hidden': 'true', style: {height: '0px'}},
            {cls: ['neo-board-column-cards'], cn: []},
            {cls: ['neo-board-spacer'], 'aria-hidden': 'true', style: {height: '0px'}}
        ]}
    }

    /**
     * @summary Keeps spacer nodes outside the component item/index contract.
     * @returns {Object}
     */
    getVdomItemsRoot() {
        return this.vdom.cn[1]
    }

    /**
     * @summary Measures the initial window only after the body reaches the DOM.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && this.parent?.scheduleWindowMeasurement()
    }

    /**
     * @summary Forwards captured native scrolling after the engine synchronizes scroll state.
     * @param {Object} data
     */
    onScrollCapture(data) {
        const column = this.parent;
        if (data.target.id === this.id &&
            Number(data.target.data?.boardNavigation ?? column?.navigationGeneration) !== column?.navigationGeneration) return;
        super.onScrollCapture(data);
        data.target.id === this.id && column?.onBodyScroll(data)
    }
}

export default Neo.setupClass(ColumnBody);
