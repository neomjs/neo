import BaseToolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.grid.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.grid.header.Toolbar'
         * @protected
         */
        className: 'Neo.grid.header.Toolbar',
        /**
         * @member {String} ntype='grid-header-toolbar'
         * @protected
         */
        ntype: 'grid-header-toolbar',
        /**
         * @member {Array} cls=['neo-grid-header-toolbar']
         */
        cls: ['grid-header-toolbar'],
        /**
         * @member {String} _layout='base'
         * @protected
         */
        _layout  : 'base',
        /**
         * @member {Object} itemDefaults={ntype:'grid-header-button'}
         * @protected
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * @member {Object} _vdom={cn:[{cls:'neo-grid-row',cn:[]}]}
         */
        _vdom:
        {cn: [
            {cls: 'neo-grid-row', cn: []}
        ]}
    }}

    /**
     *
     */
    createItems() {
        let me = this;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        super.createItems();

        let dockLeftWidth  = 0,
            dockRightWidth = 0,
            items          = me.items,
            len            = items.length,
            vdom           = me.vdom,
            style;

        items.forEach((item, index) => {
            style = item.wrapperStyle;

            // todo: only add px if number
            if (item.maxWidth) {style.maxWidth = item.maxWidth + 'px'}
            if (item.minWidth) {style.minWidth = item.minWidth + 'px'}
            if (item.width)    {style.width    = item.width    + 'px'}

            if (item.dock) {
                item.vdom.cls.push('neo-locked');

                if (item.dock === 'left') {
                    style.left = dockLeftWidth + 'px';
                }

                dockLeftWidth += (item.width + 1); // todo: borders fix
            }

            item.wrapperStyle = style;

            // inverse loop direction
            item = items[len - index -1];

            if (item.dock === 'right') {
                style = item.wrapperStyle;
                style.right = dockRightWidth + 'px';

                item.wrapperStyle = style;

                dockRightWidth += (item.width + 1); // todo: borders fix
            }
        });

        me.vdom = vdom;
    }

    /**
     * @param dock
     * @returns {String} layoutConfig
     * @override
     */
    getLayoutConfig(dock) {
        return 'base';
    }

    /**
     * @returns {Object[]} The new vdom items root
     */
    getVdomItemsRoot() {
        return this.vdom.cn[0];
    }
}

Neo.applyClassConfig(Toolbar);

export default Toolbar;
