import BaseModel from './BaseModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.selection.grid.RowModel
 * @extends Neo.selection.grid.BaseModel
 */
class RowModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.RowModel'
         * @protected
         */
        className: 'Neo.selection.grid.RowModel',
        /**
         * @member {String} ntype='selection-grid-rowmodel'
         * @protected
         */
        ntype: 'selection-grid-rowmodel',
        /**
         * @member {String} cls='neo-selection-rowmodel'
         * @protected
         */
        cls: 'neo-selection-rowmodel'
    }

    /**
     *
     */
    addDomListener() {
        let me = this;

        me.view.on('rowClick', me.onRowClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.un('rowClick', me.onRowClick, me);

        super.destroy(...args)
    }

    /**
     * Finds the matching table row for a given row index
     * @param {Number} index row index
     * @returns {String|null} The table row node id
     */
    getRowId(index) {
        if (index < 0 || this.view.store.getCount() < index) {
            return null
        }

        return this.view.vdom.cn[0].cn[1].cn[index].id
    }

    /**
     * Finds the matching table row for a given event path
     * @param {Object} path The event path
     * @returns {Object|null} The node containing the table row class or null
     * @protected
     */
    static getRowNode(path) {
        let i    = 0,
            len  = path.length,
            node = null;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-grid-row')) {
                node = path[i]
            }
        }

        return node
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(data, -1)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me           = this,
            node         = RowModel.getRowNode(data.path),
            {view}       = me,
            {store}      = view,
            vdomNode     = VDomUtil.find(view.vdom, node.id),
            newIndex     = (vdomNode.index + step) % store.getCount(),
            {parentNode} = vdomNode,
            id;

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        id = parentNode.cn[newIndex].id;

        if (id) {
            me.select(id);
            view.focus(id);

            view.fire('select', {
                record: store.getAt(newIndex)
            })
        }
    }

    /**
     * @param {Object} data
     */
    onRowClick(data) {
        let me     = this,
            id     = data.data.currentTarget,
            {view} = me,
            isSelected, record;

        if (id) {
            me.toggleSelection(id);

            isSelected = me.isSelected(id);
            record     = view.store.getAt(VDomUtil.find(view.vdom, id).index);

            !isSelected && view.onDeselect?.(record);

            view.fire(isSelected ? 'select' : 'deselect', {
                record
            })
        }
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let {id, view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(RowModel);
