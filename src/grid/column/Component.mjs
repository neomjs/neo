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
         * Components can delegate event listeners (or button handlers) into methods somewhere inside
         * the view controller or component tree hierarchy.
         *
         * In this case, it is helpful to know what the related record is, so we are adding the record
         * to the component as a property. By default, as 'record', but this config can change the property name.
         * @member {String} recordProperty='record'
         */
        recordProperty: 'record',
        /**
         * @member {String} type='component'
         * @protected
         */
        type: 'component'
    }

    /**
     * @member {Map} map=new Map()
     * @protected
     */
    map = new Map()

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
            id               = `${me.id}-component-${rowIndex % (view.availableRows + 2 * view.bufferRowRange)}`,
            component        = me.map.get(id),
            componentConfig  = me.component;

        if (Neo.typeOf(componentConfig) === 'Function') {
            componentConfig = componentConfig(data)
        }

        if (component) {
            delete componentConfig.className;
            delete componentConfig.module;
            delete componentConfig.ntype;


            componentConfig[recordProperty] = record;

            component.set(componentConfig)
        } else {
            component = Neo.create({
                ...componentConfig,
                appName,
                id,
                parentComponent : view,
                [recordProperty]: record,
                windowId
            });

            me.map.set(id, component)
        }

        view.updateDepth = -1;

        return component.createVdomReference()
    }
}

export default Neo.setupClass(Component);
