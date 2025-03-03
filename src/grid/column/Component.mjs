import Button from '../../button/Base.mjs';
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
        let {gridContainer, rowIndex} = data,
            {appName, view, windowId} = gridContainer,
            me              = this,
            id              = `${me.id}-component-${rowIndex % (view.availableRows + 2 * view.bufferRowRange)}`,
            component       = me.map.get(id),
            componentConfig = me.component;

        if (Neo.typeOf(componentConfig) === 'Function') {
            componentConfig = componentConfig(data)
        }

        if (component) {
            delete componentConfig.className;
            delete componentConfig.module;
            delete componentConfig.ntype;

            component.set(componentConfig)
        } else {
            component = Neo.create({
                ...componentConfig,
                appName,
                id,
                windowId
            });

            me.map.set(id, component)
        }

        view.updateDepth = -1;

        return component.createVdomReference()
    }
}

export default Neo.setupClass(Component);
