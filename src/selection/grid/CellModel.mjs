import Model from '../Model.mjs';

/**
 * @class Neo.selection.grid.CellModel
 * @extends Neo.selection.Model
 */
class CellModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.CellModel'
         * @protected
         */
        className: 'Neo.selection.grid.CellModel',
        /**
         * @member {String} ntype='selection-grid-cellmodel'
         * @protected
         */
        ntype: 'selection-grid-cellmodel',
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
            dataFields    = view.columns.map(c => c.field),
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
     *
     */
    unregister() {
        let me         = this,
            {id, view} = me;

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
