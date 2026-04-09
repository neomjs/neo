import BaseModel from './BaseModel.mjs';

/**
 * @class Neo.selection.grid.CellModel
 * @extends Neo.selection.grid.BaseModel
 */
class CellModel extends BaseModel {
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
        let me            = this,
            {view}        = me,
            {parent}      = view,
            gridContainer = view.gridContainer || parent, // Fallback if no specific Multi-Body structure
            listener      = {cellClick: me.onCellClick, scope: me};

        if (gridContainer.vdom.tag === 'table') {
            gridContainer = gridContainer.parent
        }

        gridContainer.on(listener)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me            = this,
            {view}        = me,
            {parent}      = view,
            gridContainer = view.gridContainer || parent;

        if (gridContainer.vdom?.tag === 'table') {
            gridContainer = gridContainer.parent
        }

        gridContainer.un('cellClick', me.onCellClick, me);

        super.destroy(...args)
    }

    /**
     * @param {Object} item
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection=this.items, selectedCls) {
        let me = this;

        super.deselect(item, silent, itemCollection, selectedCls);

        me.getActivePeers().forEach(peer => {
            try {
                let node = peer.view.getVdomChild(item);
                if (node) {
                    node.cls = NeoArray.remove(node.cls || [], selectedCls || peer.selectedCls);
                    delete node['aria-selected'];

                    if (!silent) {
                        peer.view.update()
                    }
                }
            } catch(e) {
                console.warn(e)
            }
        })
    }

    /**
     * @param {Boolean} [silent] true to prevent a vdom update
     * @param {Object[]|String[]} itemCollection=this.items
     */
    deselectAll(silent, itemCollection=this.items) {
        let me             = this,
            items          = [...itemCollection],
            hasActiveItems = items.length > 0;

        super.deselectAll(silent, itemCollection);

        if (!silent && hasActiveItems) {
            me.getActivePeers().forEach(peer => peer.view.update())
        }
    }

    /**
     * Resolves a record from a logical cell ID.
     * @param {String} logicalId
     * @returns {Neo.data.Record|null}
     */
    getRecord(logicalId) {
        let me        = this,
            {view}    = me,
            {store}   = view,
            dataField = view.getDataField(logicalId),
            // logicalId format: recordId__dataField
            recordId  = logicalId.substring(0, logicalId.length - dataField.length - 2);

        return store.get(recordId)
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me                  = this,
            {view}              = me,
            {dataField, record} = data;

        // In a multi-body architecture, ensure we only toggle the state once per click
        // by restricting the state mutation to the specific body that fired the event.
        if (data.body && data.body !== view) {
            return
        }

        if (record && dataField) {
            me.toggleSelection(view.getLogicalCellId(record, dataField))
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        !this.hasEditorFocus(data) && this.onNavKeyRow(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        !this.hasEditorFocus(data) && this.onNavKeyColumn(-1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        !this.hasEditorFocus(data) && this.onNavKeyColumn(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        !this.hasEditorFocus(data) && this.onNavKeyRow(-1)
    }

    /**
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            {store}            = view,
            currentColumn, currentIndex, newIndex, record;

        if (me.hasSelection()) {
            currentColumn = view.getDataField(me.items[0]);
            record        = me.getRecord(me.items[0])
        } else {
            currentColumn = dataFields[0];
            record        = store.getAt(0)
        }

        if (!record) {
            return
        }

        currentIndex = dataFields.indexOf(currentColumn);
        newIndex     = (currentIndex + step) % dataFields.length;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        me.select(view.getLogicalCellId(record, dataFields[newIndex]));

        view.parent.scrollByColumns(currentIndex, step)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            countRecords = store.getCount(),
            currentIndex = 0,
            dataField, newIndex;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(me.getRecord(me.items[0]));
            dataField    = view.getDataField(me.items[0])
        } else {
            dataField = me.dataFields[0]
        }

        if (countRecords < 1) {
            return
        }

        newIndex = (currentIndex + step) % countRecords;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        me.select(view.getLogicalCellId(store.getAt(newIndex), dataField));
        view.scrollByRows(currentIndex, step)
    }

    /**
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} itemCollection=this.items
     * @param {String} [selectedCls]
     */
    select(items, itemCollection=this.items, selectedCls) {
        let me = this;

        super.select(items, itemCollection, selectedCls);

        if (!Array.isArray(items)) {
            items = [items]
        }

        items.forEach(item => {
            // We hold vdom ids for now, so all incoming selections must be converted.
            let itemId = item.isRecord ? me.view.getItemId(item) : Neo.isObject(item) ? item.id : item;

            me.getActivePeers().forEach(peer => {
                try {
                    let node = peer.view.getVdomChild(itemId);
                    if (node && !node.cls?.includes(selectedCls || peer.selectedCls)) {
                        NeoArray.add(node.cls || (node.cls = []), selectedCls || peer.selectedCls);
                        node['aria-selected'] = true;

                        peer.view.update()
                    }
                } catch(e) {
                    console.warn(e)
                }
            })
        })
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me,
            scope      = id;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope}
        )
    }

    /**
     *
     */
    unregister() {
        let me         = this,
            {id, view} = me,
            scope      = id;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(CellModel);
