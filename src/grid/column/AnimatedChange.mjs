import Column   from './Base.mjs';
import VdomUtil from '../../util/VDom.mjs'

/**
 * @class Neo.grid.column.AnimatedChange
 * @extends Neo.grid.column.Base
 */
class AnimatedChange extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.AnimatedChange'
         * @protected
         */
        className: 'Neo.grid.column.AnimatedChange',
        /**
         * @member {String} type='animatedChange'
         * @protected
         */
        type: 'animatedChange'
    }

    /**
     * @param {Object}             data
     * @param {Neo.button.Base}    data.column
     * @param {Number}             data.columnIndex
     * @param {String}             data.dataField
     * @param {Neo.grid.Container} data.gridContainer
     * @param {Object}             data.record
     * @param {Number}             data.rowIndex
     * @param {Neo.data.Store}     data.store
     * @param {Number|String}      data.value
     * @returns {*}
     */
    cellRenderer({dataField, gridContainer, record, value}) {
        let {view} = gridContainer,
            cellId = view.getCellId(record, dataField),
            node   = VdomUtil.find(view.vdom, cellId)?.vdom,
            cls    = !node ? [] : node.cls.includes('neo-animated-1') ? ['neo-animated-2'] : ['neo-animated-1'];

        return {cls, html: value}
    }
}

export default Neo.setupClass(AnimatedChange);
