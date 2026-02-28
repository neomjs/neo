import Base              from '../../core/Base.mjs';
import {resolveCallback} from '../../util/Function.mjs';

/**
 * @class Neo.grid.column.Base
 * @extends Neo.core.Base
 */
class Column extends Base {
    /**
     * Valid values for hideMode
     * @member {String[]} hideModes=['display','removeDom','visibility']
     * @protected
     * @static
     */
    static hideModes = ['display', 'removeDom', 'visibility']

    static config = {
        /**
         * @member {String} className='Neo.grid.column.Base'
         * @protected
         */
        className: 'Neo.grid.column.Base',
        /**
         * Additional CSS classes to add to the cell.
         * These classes are appended to the default ones (e.g. 'neo-grid-cell').
         * @member {Function|String|String[]|null} cellCls=null
         */
        cellCls: null,
        /**
         * The field name of the data.Model to read the value from.
         * Must be unique within the grid instance.
         *
         * **Runtime Updates:**
         * You can change this config at runtime to point the column to a different model field.
         * The Grid will automatically:
         * 1. Update the internal `columnPositions` map (preserving sort order).
         * 2. Refresh the visible rows to display the new data.
         *
         * @member {String|null} dataField_=null
         * @reactive
         */
        dataField_: null,
        /**
         * @member {String} hideMode_='removeDom'
         */
        hideMode_: 'removeDom',
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
     * Triggered after the dataField config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetDataField(value, oldValue) {
        if (oldValue !== undefined) {
            let me            = this,
                gridContainer = me.parent,
                body          = gridContainer?.body,
                headerToolbar = gridContainer?.headerToolbar,
                colPositions  = body?.columnPositions,
                button        = headerToolbar?.getColumn(oldValue),
                pos           = colPositions?.get(oldValue);

            if (pos) {
                // The columnPositions collection is keyed by 'dataField'.
                // To update the key in the internal Map, we must remove the item (using the old key),
                // update the property, and re-add it (indexing with the new key).
                // Modifying it in-place would break the Map index.
                colPositions.map.delete(oldValue);
                pos.dataField = value;
                colPositions.map.set(value, pos)
            }

            if (button) {
                button.dataField = value
            }
        }
    }

    /**
     * Triggered after the windowId config got changed.
     *
     * **Non-Component Theme Injection**
     * Although `Neo.grid.column.Base` and its subclasses are not components (they extend `core.Base`),
     * they hook into the theme engine exactly like components do.
     *
     * This is a powerful architectural pattern. It allows specific column implementations
     * (like `Neo.grid.column.Icon` or `Neo.grid.column.Component`) to inject their own SCSS
     * theme files (e.g., `resources/scss/theme-neo-dark/grid/column/IconLink.scss`).
     *
     * **Best Practice:**
     * Because columns do not render their own outer DOM nodes with unique CSS classes,
     * any CSS rules defined in these injected files MUST be scoped inside `.neo-grid-cell`
     * to prevent unintended side effects on standalone components elsewhere in the application.
     *
     * @param {Number} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * Triggered before the hideMode config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetHideMode(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'hideMode')
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
