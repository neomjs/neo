import Column from './Base.mjs';

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
         * @member {Object} defaults
         * @protected
         */
        defaults: null,
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
     * @member {Map} map=new Map()
     * @protected
     */
    map = new Map()

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
     * @param {String}             data.dataField
     * @param {Neo.grid.Container} data.gridContainer
     * @param {Object}             data.record
     * @param {Number}             data.rowIndex
     * @param {Neo.data.Store}     data.store
     * @param {Number|String}      data.value
     * @returns {*}
     */
    cellRenderer(data) {
        let {gridContainer, record, rowIndex} = data,
            {appName, view, windowId}         = gridContainer,
            me               = this,
            {recordProperty} = me,
            id               = me.getComponentId(rowIndex),
            component        = me.map.get(id),
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

            component.set(componentConfig)
        } else {
            component = Neo.create({
                ...me.defaults,
                ...componentConfig,
                appName,
                id,
                parentComponent : view,
                [recordProperty]: record,
                windowId
            });

            // We need to ensure that wrapped components always get the same index-based id.
            if (!component.vdom.id) {
                component.vdom.id = id + '__wrapper'
            }

            me.map.set(id, component)
        }

        if (me.useBindings) {
            view.getStateProvider()?.parseConfig(component)
        }

        view.updateDepth = -1;

        return component.createVdomReference()
    }

    /**
     * @param {Number} rowIndex
     * @returns {String}
     */
    getComponentId(rowIndex) {
        let me     = this,
            {view} = me.parent;

        return `${me.id}-component-${rowIndex % (view.availableRows + 2 * view.bufferRowRange)}`
    }
}

export default Neo.setupClass(Component);
