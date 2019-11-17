import Model from '../Model.mjs';

/**
 * @class Neo.selection.table.CellModel
 * @extends Neo.selection.Model
 */
class CellModel extends Model {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.selection.table.CellModel'
             * @private
             */
            className: 'Neo.selection.table.CellModel',
            /**
             * @member {String} ntype='selection-table-cellmodel'
             * @private
             */
            ntype: 'selection-table-cellmodel',
            /**
             * @member {String} cls='selection-cellmodel'
             * @private
             */
            cls: 'neo-selection-cellmodel'
        }
    }

    /**
     *
     */
    addDomListener() {
        let me           = this,
            view         = me.view,
            domListeners = view.domListeners;

        domListeners.push({
            click   : me.onCellClick,
            delegate: '.neo-table-cell',
            scope   : me
        });

        view.domListeners = domListeners;
    }

    /**
     *
     * @param {Object} data
     */
    onCellClick(data) {
        let me   = this,
            id   = null,
            path = data.path,
            i    = 0,
            len  = path.length;

        for (; i < len; i++) {
            if (path[i].tagName === 'td') {
                id = path[i].id;
                break;
            }
        }

        if (id) {
            me.toggleSelection(id);
        }
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
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1);
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
    onNavKeyColumn(data, step) {
        let me            = this,
            view          = me.view,
            idArray       = data.path[0].id.split('__'),
            currentColumn = idArray[2],
            dataFields    = view.columns.map(c => c.dataField),
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
     *
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
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys._keys.push(
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            );
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
            view.keys.removeKeys([
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            ]);
        }

        super.unregister();
    }
}

Neo.applyClassConfig(CellModel);

export {CellModel as default};