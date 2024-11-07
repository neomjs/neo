import Model from '../Model.mjs';

/**
 * @class Neo.selection.table.CellModel
 * @extends Neo.selection.Model
 */
class CellModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.CellModel'
         * @protected
         */
        className: 'Neo.selection.table.CellModel',
        /**
         * @member {String} ntype='selection-table-cellmodel'
         * @protected
         */
        ntype: 'selection-table-cellmodel',
        /**
         * @member {String} cls='neo-selection-cellmodel'
         * @protected
         */
        cls: 'neo-selection-cellmodel'
    }

    /**
     *
     */
    addDomListener() {
        let me = this;

        me.view.on('cellClick', me.onCellClick, me)
    }

    /**
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection=this.items, selectedCls) {
        let {view} = this;

        if (!silent) {
            view.updateDepth = 2
        }

        super.deselect(item, silent, itemCollection, selectedCls)
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     */
    deselectAll(silent) {
        let {view} = this;

        if (!silent) {
            view.updateDepth = 2
        }

        super.deselectAll(silent)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.un('cellClick', me.onCellClick, me);

        super.destroy(...args);
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        this.toggleSelection(data.data.currentTarget)
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
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1)
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
    onNavKeyColumn(data, step) {
        let me            = this,
            {view}        = me,
            idArray       = data.path[0].id.split('__'),
            currentColumn = idArray[2],
            dataFields    = view.columns.map(c => c.dataField),
            newIndex      = (dataFields.indexOf(currentColumn) + step) % dataFields.length,
            id;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        idArray[2] = dataFields[newIndex];
        id = idArray.join('__');

        me.select(id);
        view.focus(id)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me       = this,
            {view}   = me,
            {store}  = view,
            idArray  = data.path[0].id.split('__'),
            recordId = idArray[1],
            newIndex = (store.indexOf(recordId) + step) % store.getCount(),
            id;

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        idArray[1] = store.getKeyAt(newIndex);
        id = idArray.join('__');

        me.select(id);
        view.focus(id)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        )
    }

    /**
     * @param {Object} args
     */
    select(...args) {
        let {view} = this;

        if (!view.silentSelect) {
            view.updateDepth = 2
        }

        super.select(...args)
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(CellModel);
