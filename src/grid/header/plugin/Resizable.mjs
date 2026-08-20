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
                // Resolve the body via the toolbar's own getter, never by walking parents:
                // `grid.header.Wrapper` sits between the toolbar and the grid.Container, so the
                // former `toolbar.parent.body` walk yielded undefined and this live cell update
                // silently stopped running — the header resized alone.
                let body = owner.parent?.body;

                // `wrapperStyle` carries an inline width that outranks the vdom `width` key
                // `afterSetWidth()` maintains, so setting the config alone leaves the rendered button
                // at its pre-drag size: the header would stay put for the whole gesture while
                // `updateCellPositions()` below has already moved the body. `onDragEnd()` refreshes
                // `wrapperStyle` from the proxy, which is why the header used to snap into place only
                // on drop.
                //
                // One `set()` rather than two assignments: this runs per pointer step, and separate
                // setters would emit the stale-width update and then the correcting style update as
                // two cascades per sample.
                //
                // The partial is deliberate — `wrapperStyle_` is a `merge: 'shallow'` descriptor, so
                // width alone lands and the resize dimming survives. Spreading the current value
                // instead would be a trap: `beforeGetWrapperStyle()` returns `{...vdom.style, ...value}`,
                // so a read-back pins every leaked rendered style — including the proxy's `position`,
                // `left`, `top` and `transform` — into the config that `onDragEnd()` then has to null.
                owner.set({
                    width       : newWidth,
                    wrapperStyle: {width: `${newWidth}px`}
                });

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
