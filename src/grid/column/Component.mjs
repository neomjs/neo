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

        if (Neo.typeOf(componentConfig) === 'Function') {
            componentConfig = componentConfig(data)
        }

        componentConfig = me.applyRecordConfigs(componentConfig, record);
        componentConfig = {...componentConfig};

        if (component) {
            delete componentConfig.className;
            delete componentConfig.module;
            delete componentConfig.ntype;

            componentConfig[recordProperty] = record;

            if (componentConfig.hideMode === undefined) {
                componentConfig.hideMode = me.hideMode
            }

            component.set(componentConfig, silent)
        } else {
            component = Neo.create({
                hideMode: me.hideMode,
                ...me.defaults,
                ...componentConfig,
                appName,
                parentComponent : row,
                [recordProperty]: record,
                windowId
            })
        }

        if (me.useBindings) {
            gridContainer.body.getStateProvider()?.createBindings(component)
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
