import Model                 from '../Model.mjs';
import {default as VDomUtil} from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.RowModel
 * @extends Neo.selection.Model
 */
class RowModel extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.selection.table.RowModel'
         * @private
         */
        className: 'Neo.selection.table.RowModel',
        /**
         * @member {String} ntype='selection-table-rowmodel'
         * @private
         */
        ntype: 'selection-table-rowmodel',
        /**
         * @member {String} cls='selection-rowmodel'
         * @private
         */
        cls: 'neo-selection-rowmodel'
    }}

    /**
     *
     */
    addDomListener() {
        let me           = this,
            view         = me.view,
            domListeners = view.domListeners;

        domListeners.push({
            click   : me.onRowClick,
            delegate: '.neo-table-row',
            scope   : me
        });

        view.domListeners = domListeners;
    }

    /**
     * Finds the matching table row for a given row index
     * @param {Number} index row index
     * @returns {String|null} The table row node id
     */
    getRowId(index) {
        if (index < 0 || this.view.store.getCount() < index) {
            return null;
        }

        return this.view.vdom.cn[0].cn[1].cn[index].id;
    }

    /**
     * Finds the matching table row for a given event path
     * @param {Object} path The event path
     * @returns {Object|null} The node containing the table row class or null
     * @private
     */
    static getRowNode(path) {
        let i    = 0,
            len  = path.length,
            node = null;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-table-row')) {
                node = path[i];
            }
        }

        return node;
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(data, -1);
    }

    /**
     *
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me         = this,
            node       = RowModel.getRowNode(data.path),
            view       = me.view,
            store      = view.store,
            vdomNode   = VDomUtil.findVdomChild(view.vdom, node.id),
            newIndex   = (vdomNode.index + step) % store.getCount(),
            parentNode = vdomNode.parentNode,
            id;

        while (newIndex < 0) {
            newIndex += store.getCount();
        }

        id = parentNode.cn[newIndex].id;

        if (id) {
            me.select(id);
            view.focus(id);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onRowClick(data) {
        let me   = this,
            node = RowModel.getRowNode(data.path),
            id   = node && node.id;

        if (id) {
            me.toggleSelection(id);
        }
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys._keys.push({
                fn   : 'onKeyDownDown',
                key  : 'Down',
                scope: id
            }, {
                fn   : 'onKeyDownUp',
                key  : 'Up',
                scope: id
            });
        }
    }

    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys.removeKeys([{
                fn   : 'onKeyDownDown',
                key  : 'Down',
                scope: id
            }, {
                fn   : 'onKeyDownUp',
                key  : 'Up',
                scope: id
            }]);
        }

        super.unregister();
    }
}

Neo.applyClassConfig(RowModel);

export {RowModel as default};