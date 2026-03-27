import BaseResizable from '../../../plugin/Resizable.mjs';

/**
 * @class Neo.grid.header.plugin.Resizable
 * @extends Neo.plugin.Resizable
 */
class Resizable extends BaseResizable {
    static config = {
        /**
         * @member {String} className='Neo.grid.header.plugin.Resizable'
         * @protected
         */
        className: 'Neo.grid.header.plugin.Resizable',
        /**
         * @member {String} ntype='plugin-grid-header-resizable'
         * @protected
         */
        ntype: 'plugin-grid-header-resizable',
        /**
         * @member {String} delegationCls='neo-grid-header-button'
         */
        delegationCls: 'neo-grid-header-button',
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
     * @param {Object} data
     */
    onDragMove(data) {
        let me          = this,
            {dragProxy} = me.dragZone;

        // Since dragZoneConfig: {useProxyWrapper: false} is set, the proxy is a single-node
        // component. Neo.component.Base merges `style` over `wrapperStyle`.
        // DragZone applies a hardcoded initial `width` to the proxy's `style`.
        // We must completely delete it so the base plugin's `wrapperStyle` updates can take effect.
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
                let toolbar = owner.parent,
                    body    = toolbar?.parent?.body;

                owner.width = newWidth;

                if (body) {
                    body.updateCellPositions(owner.dataField, newWidth)
                }
            }
        }
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me          = this,
            {owner}     = me,
            {dragProxy} = me.dragZone,
            toolbar     = owner.parent,
            newWidth    = dragProxy ? parseInt(dragProxy.wrapperStyle.width, 10) : null;

        super.onDragEnd(data);

        // The base plugin blindly copies absolute coordinates from the proxy to the owner.
        // We must clean them up so we don't break the header's flexbox layout.
        if (newWidth) {
            let style = owner.wrapperStyle;
            style.height    = null;
            style.left      = null;
            style.position  = null;
            style.top       = null;
            style.opacity   = null;
            style.transform = null;

            owner.wrapperStyle = style;
            owner.width        = newWidth;

            toolbar?.passSizeToBody()
        }

        if (toolbar) {
            toolbar.removeCls('neo-is-resizing');
            me.timeout(10).then(() => {
                toolbar.dragResortable = true
            })
        }
    }

    /**
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
}

export default Neo.setupClass(Resizable);
