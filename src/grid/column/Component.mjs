import {isDescriptor} from '../../core/ConfigSymbols.mjs';
import Column         from './Base.mjs';

/**
 * @class Neo.grid.column.Component
 * @extends Neo.grid.column.Base
 */
class Component extends Column {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Component'
         * @protected
         */
        className: 'Neo.grid.column.Component',
        /**
         * @member {Function|Object|null} component=null
         */
        component: null,
        /**
         * @member {Object} defaults_
         * @protected
         * @reactive
         */
        defaults_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
        /**
         * @member {String} hideMode='visibility'
         */
        hideMode: 'visibility',
        /**
         * Components can delegate event listeners (or button handlers) into methods somewhere inside
         * the view controller or component tree hierarchy.
         *
         * In this case, it is helpful to know what the related record is, so we are adding the record
         * to the component as a property. By default, as 'record', but this config can change the property name.
         * @member {String} recordProperty='record'
         */
        recordProperty: 'record',
        /**
         * @member {String} rendererScope='this'
         * @protected
         */
        rendererScope: 'this',
        /**
         * @member {String} type='component'
         * @protected
         */
        type: 'component',
        /**
         * Set this config to true, in case you want to use 'bind' inside your cell based component.
         *
         * **Performance Warning (Static Bindings Only):**
         * Because grid cells are pooled and recycled during scrolling, `StateProvider` bindings are evaluated
         * exactly **once** when the component is first instantiated.
         *
         * Your `bind` functions must **never** rely on dynamically iterating `record` data from the `cellRenderer` scope.
         * Bindings are strictly for global or hierarchical UI state (e.g. `animateVisuals`).
         * For record-specific data, pass the values directly within the component config object, which is updated on every recycle.
         *
         * @member {Boolean} useBindings=false
         */
        useBindings: false
    }

    /**
     * Override as needed inside class extensions
     * @param {Object} config
     * @param {Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return config
    }

    /**
     * @param {Object}             data
     * @param {Neo.column.Base}    data.column
     * @param {Number}             data.columnIndex
     * @param {Neo.component.Base} [data.component]
     * @param {String}             data.dataField
     * @param {Neo.grid.Container} data.gridContainer
     * @param {Object}             data.record
     * @param {Neo.grid.Row}       data.row
     * @param {Number}             data.rowIndex
     * @param {Neo.data.Store}     data.store
     * @param {Number|String}      data.value
     * @returns {*}
     */
    cellRenderer(data) {
        let {component, gridContainer, record, row, silent} = data,
            {appName, windowId} = gridContainer,
            me               = this,
            {recordProperty} = me,
            componentConfig  = me.component;

        /**
         * Optimization: If the record instance AND its version haven't changed, we can short-circuit.
         * This skips:
         * 1. Executing the 'component' config function (if it is one).
         * 2. Calling component.set() which triggers the config system overhead.
         * 3. Unnecessary VDOM updates.
         */
        if (component && component[recordProperty] === record && component.lastRecordVersion === record.version) {
            return component
        }

        if (Neo.typeOf(componentConfig) === 'Function') {
            componentConfig = componentConfig(data)
        }

        componentConfig = me.applyRecordConfigs(componentConfig, record);
        componentConfig = {...componentConfig};

        if (component) {
            component.lastRecordVersion = record.version;

            delete componentConfig.className;
            delete componentConfig.module;
            delete componentConfig.ntype;

            componentConfig[recordProperty] = record;

            if (componentConfig.hideMode === undefined) {
                componentConfig.hideMode = me.hideMode
            }

            // **Prevent Stale State in Pooled Cells**
            // During grid scrolling (Row Pooling), existing cell components are recycled for new records.
            // If a new record is missing a data field, `record[dataField]` returns `undefined`.
            // The Neo.mjs config system's `set()` method ignores `undefined` values, meaning the
            // component would retain the old record's state, causing visual bugs (e.g., showing a
            // GitHub org from the previous row on a user who has no orgs).
            // Converting `undefined` to `null` forces the change detection to explicitly clear the state.
            for (const key in componentConfig) {
                if (componentConfig[key] === undefined) {
                    componentConfig[key] = null
                }
            }

            // Enforce static bindings on pooled components to prevent OOM leaks
            // Bindings belong to the global UI state, not iterating record state.
            delete componentConfig.bind;

            component.set(componentConfig, silent)
        } else {
            component = Neo.create({
                hideMode: me.hideMode,
                ...me.defaults,
                ...componentConfig,
                appName,
                parentComponent  : row,
                [recordProperty] : record,
                lastRecordVersion: record.version,
                theme            : row.theme,
                windowId
            });

            // Only create bindings ONCE upon component instantiation
            if (me.useBindings) {
                gridContainer.body.getStateProvider()?.createBindings(component)
            }
        }

        return component
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me  = this,
            out = super.toJSON();

        out.recordProperty = me.recordProperty;
        out.useBindings    = me.useBindings;

        if (Neo.isObject(me.component)) {
            out.component = me.serializeConfig(me.component)
        }

        if (Neo.isObject(me.defaults)) {
            out.defaults = me.serializeConfig(me.defaults)
        }

        return out
    }
}

export default Neo.setupClass(Component);
