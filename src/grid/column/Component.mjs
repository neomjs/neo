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
    cellRenderer({gridContainer, record, rowIndex}) {
        let me                        = this,
            {appName, view, windowId} = gridContainer,
            componentId               = `${me.id}-component-${rowIndex}`,
            component                 = me.map.get(componentId);

        if (component) {
            component.set({
                record
            })
        } else {
            component = Neo.create({
                appName,
                record,
                windowId,
                ...me.component
            });

            me.map.set(componentId, component)
        }

        view.updateDepth = -1;

        return component.createVdomReference()
    }
}

export default Neo.setupClass(Component);
