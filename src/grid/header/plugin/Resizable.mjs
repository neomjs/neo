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
        directions: ['r']
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me          = this,
            {owner}     = me,
            {dragProxy} = me.dragZone,
            newWidth    = dragProxy ? parseInt(dragProxy.wrapperStyle.width, 10) : null;

        super.onDragEnd(data);

        if (newWidth) {
            owner.width = newWidth;
            owner.up('grid-header-toolbar')?.passSizeToBody();
        }
    }
}

export default Neo.setupClass(Resizable);
