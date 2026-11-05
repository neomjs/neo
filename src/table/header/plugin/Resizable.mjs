import BaseResizable from '../../../plugin/Resizable.mjs';

/**
 * @summary Enables drag-and-drop right-edge column resizing for `Neo.table.header.Button` instances.
 *
 * Extends `Neo.plugin.Resizable` with `delegationCls: 'neo-table-header-button'`, `directions: ['r']`, and
 * `minWidth: 100`. During a resize gesture (`onDragMove`), updates the owning `Neo.table.header.Button`'s
 * `width` and `<th>` `wrapperStyle` (`maxWidth`, `minWidth`, `width`) so the native `<table>` layout resizes
 * both widening and narrowing columns in real time. On drop (`onDragEnd`), removes temporary proxy coordinates
 * from `wrapperStyle`, recalculates sticky dock offsets on the parent `Neo.table.header.Toolbar`, and restores
 * header drag-reordering (`dragResortable`).
 *
 * @class Neo.table.header.plugin.Resizable
 * @extends Neo.plugin.Resizable
 */
class Resizable extends BaseResizable {
    static config = {
        /**
         * @member {String} className='Neo.table.header.plugin.Resizable'
         * @protected
         */
        className: 'Neo.table.header.plugin.Resizable',
        /**
         * @member {String} ntype='plugin-table-header-resizable'
         * @protected
         */
        ntype: 'plugin-table-header-resizable',
        /**
         * @member {String} delegationCls='neo-table-header-button'
         */
        delegationCls: 'neo-table-header-button',
        /**
         * Restrict resizing to the right edge only
         * @member {String[]} directions=['r']
         * @reactive
         */
        directions: ['r'],
        /**
         * @member {Number} minWidth=100
         */
        minWidth: 100
    }

    /**
     * Live-updates the owning `Neo.table.header.Button` width and `<th>` wrapper dimensions (`minWidth`,
     * `maxWidth`, `width`) on each drag sample while clearing the initial hardcoded proxy style width.
     * @param {Object} data
     */
    onDragMove(data) {
        let me          = this,
            {dragProxy} = me.dragZone;

        // DragZone applies a hardcoded initial `width` to the proxy's `style`, which overrides `wrapperStyle`.
        // Delete it so the base plugin's `wrapperStyle` updates take effect during the drag.
        if (dragProxy?.style?.width) {
            let proxyStyle = dragProxy.style;
            delete proxyStyle.width;
            dragProxy.style = proxyStyle
        }

        super.onDragMove(data);

        if (dragProxy) {
            let {owner}  = me,
                newWidth = parseInt(dragProxy.wrapperStyle.width, 10);

            if (newWidth && newWidth !== owner.width) {
                owner.set({
                    width       : newWidth,
                    wrapperStyle: {
                        maxWidth: `${newWidth}px`,
                        minWidth: `${newWidth}px`,
                        width   : `${newWidth}px`
                    }
                });

                if (owner.dock) {
                    owner.parent?.passSizeToBody?.()
                }
            }
        }
    }

    /**
     * Completes the column resize gesture, stripping absolute proxy coordinates from the `<th>` wrapper
     * and restoring toolbar sort-drag state.
     * @param {Object} data
     */
    onDragEnd(data) {
        let me          = this,
            {owner}     = me,
            {dragProxy} = me.dragZone,
            toolbar     = owner.parent,
            newWidth    = dragProxy ? parseInt(dragProxy.wrapperStyle.width, 10) : null;

        super.onDragEnd(data);

        // The base plugin copies absolute coordinates from the proxy to `owner.wrapperStyle`.
        // Clear them so they do not corrupt the `<th>` table-header layout.
        if (newWidth) {
            let style = owner.wrapperStyle;
            style.height    = null;
            style.left      = null;
            style.maxWidth  = `${newWidth}px`;
            style.minWidth  = `${newWidth}px`;
            style.opacity   = null;
            style.position  = null;
            style.top       = null;
            style.transform = null;
            style.width     = `${newWidth}px`;

            owner.wrapperStyle = style;
            owner.width        = newWidth;

            toolbar?.passSizeToBody?.()
        }

        if (toolbar) {
            toolbar.removeCls('neo-is-resizing');
            me.timeout(10).then(() => {
                if (!toolbar.isDestroyed && !toolbar.isDestroying) {
                    toolbar.dragResortable = true
                }
            })
        }
    }

    /**
     * Marks the parent `Neo.table.header.Toolbar` as resizing and suspends column-reorder drag sorting
     * for the duration of the resize gesture.
     * @param {Object} data
     */
    onDragStart(data) {
        let toolbar = this.owner.parent;

        if (toolbar) {
            toolbar.addCls('neo-is-resizing');
            toolbar.dragResortable = false
        }

        super.onDragStart(data)
    }

    /**
     * Suppresses resize handle injection when the owning header button has `resizable: false`.
     * @param {Object} data
     */
    onMouseMove(data) {
        if (this.owner.resizable) {
            super.onMouseMove(data)
        }
    }
}

export default Neo.setupClass(Resizable);
