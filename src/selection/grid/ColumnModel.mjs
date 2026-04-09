import BaseModel from './BaseModel.mjs';

/**
 * @class Neo.selection.grid.ColumnModel
 * @extends Neo.selection.grid.BaseModel
 */
class ColumnModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.ColumnModel'
         * @protected
         */
        className: 'Neo.selection.grid.ColumnModel',
        /**
         * @member {String} ntype='selection-grid-columnmodel'
         * @protected
         */
        ntype: 'selection-grid-columnmodel',
        /**
         * @member {String} cls='neo-selection-columnmodel'
         * @protected
         */
        cls: 'neo-selection-columnmodel'
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
     * @returns {Boolean}
     */
    hasSelection() {
        return this.selectedColumns.length > 0
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me        = this,
            {view}    = me,
            cellId    = data.data.currentTarget,
            dataField = cellId && view.getDataField(cellId);

        // In a multi-body architecture, ensure we only toggle the state once per click
        // by restricting the state mutation to the specific body that fired the event.
        if (data.body && data.body !== view) {
            return
        }

        if (dataField) {
            me.selectedColumns = me.isSelectedColumn(dataField) ? [] : [dataField];

            // Sync visual state to sibling sub-grids
            me.getActivePeers().forEach(peer => peer.view.createViewData());

            view.createViewData()
        }
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
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            currentColumn, currentIndex, index;

        if (me.hasSelection()) {
            currentColumn = me.selectedColumns[0]
        } else {
            currentColumn = dataFields[0]
        }

        currentIndex = dataFields.indexOf(currentColumn);
        index        = (currentIndex + step) % dataFields.length;

        while (index < 0) {
            index += dataFields.length
        }

        me.selectedColumns = [dataFields[index]];

        view.createViewData();

        view.parent.scrollByColumns(currentIndex, step)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let {id, view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let me         = this,
            {id, view} = me;

        me.selectedColumns = [];
        me.view.createViewData();

        view.keys?.removeKeys([
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(ColumnModel);
