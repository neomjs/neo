import Model from '../Model.mjs';

/**
 * @class Neo.selection.grid.CellModel
 * @extends Neo.selection.Model
 */
class CellModel extends Model {
    static getConfig() {return {
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
         * @member {String} cls='selection-cellmodel'
         * @protected
         */
        cls: 'neo-selection-cellmodel'
    }}

    /**
     *
     */
    addDomListener() {
        let me   = this,
            view = me.view;

        view.addDomListeners({
            click   : me.onCellClick,
            delegate: '.neo-grid-cell',
            scope   : me
        });
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me   = this,
            path = data.path,
            i    = 0,
            len  = path.length,
            id;

        for (; i < len; i++) {
            if (path[i].cls.includes('neo-grid-cell')) {
                id = path[i].id;
                break;
            }
        }

        id && me.toggleSelection(id);
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 1);
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1);
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1);
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(data, -1);
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me            = this,
            view          = me.view,
            idArray       = data.path[0].id.split('__'),
            currentColumn = idArray[2],
            dataFields    = view.columns.map(c => c.field),
            newIndex      = (dataFields.indexOf(currentColumn) + step) % dataFields.length,
            id;

        while (newIndex < 0) {
            newIndex += dataFields.length;
        }

        idArray[2] = dataFields[newIndex];
        id = idArray.join('__');

        me.select(id);
        view.focus(id);
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyRow(data, step) {
        let me       = this,
            view     = me.view,
            store    = view.store,
            idArray  = data.path[0].id.split('__'),
            recordId = idArray[1],
            newIndex = (store.indexOf(recordId) + step) % store.getCount(),
            id;

        while (newIndex < 0) {
            newIndex += store.getCount();
        }

        idArray[1] = store.getKeyAt(newIndex);
        id = idArray.join('__');

        me.select(id);
        view.focus(id);
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        );
    }

    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        ]);

        super.unregister();
    }
}

Neo.applyClassConfig(CellModel);

export default CellModel;
