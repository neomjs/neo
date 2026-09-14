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
     * The View-owned model hears each click once, from whichever body received it.
     * @param {Object} data
     * @param {String} data.dataField
     */
    onCellClick({dataField}) {
        dataField && this.setSelectedColumns(this.isSelectedColumn(dataField) ? [] : [dataField])
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
        this.view.parent.scrollByColumns(this.stepSelectedColumn(step), step)
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
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(ColumnModel);
