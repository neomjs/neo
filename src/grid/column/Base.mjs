import Base              from '../../core/Base.mjs';
import {resolveCallback} from '../../util/Function.mjs';

/**
 * @class Neo.grid.column.Base
 * @extends Neo.core.Base
 */
class Column extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Base'
         * @protected
         */
        className: 'Neo.grid.column.Base',
        /**
         * @member {String|null} dataField=null
         */
        dataField: null,
        /**
         * @member {Neo.grid.Container|null} parent=null
         */
        parent: null,
        /**
         * @member {Function|String|null} renderer_='cellRenderer'
         */
        renderer_: 'cellRenderer',
        /**
         * Scope to execute the column renderer.
         * Defaults to the column instance
         * @member {Neo.core.Base|null} rendererScope=null
         */
        rendererScope: null,
        /**
         * @member {String} type='column'
         * @protected
         */
        type: 'column',
        /**
         * @member {Number|null} windowId_=null
         */
        windowId_: null
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * Triggered before the renderer config gets changed
     * @param {Function|String|null} value
     * @param {Function|String|null} oldValue
     * @protected
     */
    beforeSetRenderer(value, oldValue) {
        return resolveCallback(value, this).fn
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
    cellRenderer(data) {
        return data.value
    }
}

export default Neo.setupClass(Column);
