import Model    from '../Model.mjs';
import VDomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.RowModel
 * @extends Neo.selection.Model
 */
class RowModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.RowModel'
         * @protected
         */
        className: 'Neo.selection.table.RowModel',
        /**
         * @member {String} ntype='selection-table-rowmodel'
         * @protected
         */
        ntype: 'selection-table-rowmodel',
        /**
         * @member {String} cls='selection-rowmodel'
         * @protected
         */
        cls: 'neo-selection-rowmodel',
        /**
         * @member {Number} dblclickTimerId=0
         */
        dblclickTimerID: 0,
        /**
         * When dblclick is enabled, the time delay to 
         * rule out single clicks, in milliseconds.
         * @member {Number} dblclickDelay=510
         */
        dblclickDelay: 510,
        /**
         * @member {Boolean} dblclickCase=false
         */
        dblclickDetected: false,
        /**
         * True to handle doubleclick in addition to single click.
         * @member {Boolean} dblclickEnabled=false
         */
        dblclickEnabled: false
    }

    /**
     *
     */
    addDomListener() {
        let me   = this,
            view = me.view;

        view.addDomListeners({
            click   : me.parseRowClick,
            dblclick: me.onRowDblClick,
            delegate: '.neo-table-row',
            scope   : me
        });
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
     * @protected
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
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(data, 1);
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

            view.fire('select', {
                record: store.getAt(newIndex)
            });
        }
    }


    /**
     * @param {Object} data
     */
    onRowClick(data) {
        let me   = this,
            node = RowModel.getRowNode(data.path),
            id   = node?.id,
            view = me.view,
            isSelected, record;
            
        if (! id) { return };

        record = view.store.getAt(VDomUtil.findVdomChild(view.vdom, id).index);
        view.fire('rowclick', {data, record});
        
        if ( ! (data.altKey || data.ctrlKey || data.metaKey || data.shiftKey) ) {
            me.toggleSelection(id);
            
            isSelected = me.isSelected(id);

            !isSelected && view.onDeselect?.(record);

            view.fire(isSelected ? 'select' : 'deselect', {
                record
            });
        }
    }

    /**
     * If dblclickEnabled === true, sets dblclickDeteted to true
     * and resets timer.
     * @param {Object} data
     */
    onRowDblClick(data) {
        let me   = this;
        
        clearTimeout(me.dblclickTimerId);
        me.dblclickDetected = true;

        if (! me.dblclickEnabled ) {return};
        
        let  node = RowModel.getRowNode(data.path),
            id   = node?.id,
            view = me.view,
            isSelected, record;

        if (! id) { return };

        record = view.store.getAt(VDomUtil.findVdomChild(view.vdom, id).index);
        view.fire('rowclick', {data, record})
    }

    /**
     * If dblclickEnabled === true, delays calling onRowClick to test
     * if onRowDblClick detects a dblclick event.
     * @param {Object} data
     */
    parseRowClick() {
        let me = this;

        if (! me.dblclickEnabled) {
            me.onRowClick(...arguments);
        } else {
            me.dblclickTimerId = setTimeout(function() {
                if (! me.dblclickDetected) {
                    me.onRowClick(...arguments);
                };
                me.dblclickDetected = false;
            }, me.dblclickDelay, ...arguments);
        }
    }


    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let id   = this.id,
            view = this.view;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        );
    }

    /**
     *
     */
    unregister() {
        let id   = this.id,
            view = this.view;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        ]);

        super.unregister();
    }
}

Neo.applyClassConfig(RowModel);

export default RowModel;
