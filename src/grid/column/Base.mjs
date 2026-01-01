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
         * @reactive
         */
        renderer_: 'cellRenderer',
        /**
         * Scope to execute the column renderer.
         * Defaults to the grid.Body.
         * You can pass the strings 'this' or 'me'
         * @member {Neo.core.Base|String|null} rendererScope=null
         */
        rendererScope: null,
        /**
         * @member {String} type='column'
         * @protected
         */
        type: 'column',
        /**
         * @member {Number|null} windowId_=null
         * @reactive
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
        // If no fn is found inside the parent tree, return the plain value for view controllers to match
        return resolveCallback(value, this).fn || value
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
    cellRenderer({value}) {
        return value
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me  = this,
            out = super.toJSON();

        out.dataField = me.dataField;
        out.type      = me.type;

        if (Neo.isString(me.renderer)) {
            out.renderer = me.renderer
        }

        return out
    }
}

export default Neo.setupClass(Column);
