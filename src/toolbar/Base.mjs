import Button    from '../button/Base.mjs';
import Component from '../component/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.toolbar.Base
 * @extends Neo.container.Base
 */
class Toolbar extends Container {
    /**
     * Valid values for dock
     * @member {String[]} dockPositions=['top','right','bottom','left', null]
     * @static
     */
    static dockPositions = ['top', 'right', 'bottom', 'left', null]

    static config = {
        /**
         * @member {String} className='Neo.toolbar.Base'
         * @protected
         */
        className: 'Neo.toolbar.Base',
        /**
         * @member {String} ntype='toolbar'
         * @protected
         */
        ntype: 'toolbar',
        /**
         * @member {String[]} baseCls=['neo-toolbar']
         */
        baseCls: ['neo-toolbar'],
        /**
         * @member {String|null} dock_=null
         * @reactive
         */
        dock_: null,
        /**
         * @member {Object} itemDefaults={ntype:'button'}
         * @reactive
         */
        itemDefaults: {
            ntype: 'button'
        },
        /**
         * @member {Object} layout={ntype:'flexbox',align:'center',direction: 'row', pack:'start'}
         * @reactive
         */
        layout: {
            ntype    : 'flexbox',
            align    : 'center',
            direction: 'row',
            pack     : 'start'
        }
    }

    /**
     * Triggered after the dock config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDock(value, oldValue) {
        if (!value && !oldValue) {
            return
        }

        let me            = this,
            {cls}         = me,
            dockPositions = me.getStaticConfig('dockPositions'),
            layoutConfig  = me.getLayoutConfig();

        dockPositions.forEach(key => {
            key !== null && NeoArray.toggle(cls, 'neo-dock-' + key, key === value)
        });

        if (!me.layout) {
            layoutConfig.ntype = 'flexbox';
            me.set({cls, layout: layoutConfig})
        } else {
            me.layout.set(layoutConfig);
            me.cls = cls;
        }
    }

    /**
     * Checks if the new dock position matches a value of the static dockPositions config
     * @param {String} value
     * @param {String} oldValue
     * @returns {String} value
     * @protected
     */
    beforeSetDock(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'dock', 'dockPositions')
    }

    /**
     *
     */
    createItems() {
        let items = this._items;

        if (Array.isArray(items)) {
            this._items = items.map(item => this.replaceSpacer(item))
        }

        return super.createItems()
    }

    /**
     * Creates a layout config depending on this.dock
     * @returns {Object} layoutConfig
     */
    getLayoutConfig() {
        let me = this,
            layoutConfig;

        if (me.dock) {
            switch (me.dock) {
                case 'bottom':
                case 'top':
                    layoutConfig = {
                        align    : 'center',
                        direction: 'row',
                        pack     : 'start'
                    };
                    break
                case 'left':
                    layoutConfig = {
                        align    : 'center',
                        direction: 'column-reverse',
                        pack     : 'start'
                    };
                    break
                case 'right':
                    layoutConfig = {
                        align    : 'center',
                        direction: 'column',
                        pack     : 'start'
                    };
                    break
            }
        }

        return layoutConfig || me.layout
    }

    /**
     * Inserts an item or array of items at a specific index
     * @param {Number} index
     * @param {Array|Object} item
     * @param {Boolean} [silent=false]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    insert(index, item, silent=false) {
        if (Array.isArray(item)) {
            item = item.map(item => this.replaceSpacer(item))
        } else {
            item = this.replaceSpacer(item)
        }

        return super.insert(index, item, silent)
    }

    /**
     * @param {Array|Object|String} item
     * @returns {Array|Object}
     */
    replaceSpacer(item) {
        return item === '->' ? {module: Component, flex: 1} : item
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            dock: this.dock
        }
    }
}

export default Neo.setupClass(Toolbar);
