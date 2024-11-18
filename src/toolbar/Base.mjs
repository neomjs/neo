import Button    from '../button/Base.mjs';
import Component from '../component/Base.mjs';
import Container from '../container/Base.mjs';
import Label     from '../component/Label.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.toolbar.Base
 * @extends Neo.container.Base
 */
class Base extends Container {
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
         */
        dock_: null,
        /**
         * @member {Object} itemDefaults={ntype:'button'}
         */
        itemDefaults: {
            ntype: 'button'
        },
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'center', pack : 'start'}
         */
        layout: {
            ntype: 'hbox',
            align: 'center',
            pack : 'start'
        },
        /**
         * @member {Boolean} sortable_=false
         */
        sortable_: false,
        /**
         * @member {Neo.draggable.toolbar.SortZone|null} sortZone=null
         */
        sortZone: null,
        /**
         * @member {Object} sortZoneConfig=null
         */
        sortZoneConfig: null
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);

        if (this.sortZone) {
            this.sortZone.appName = value
        }
    }

    /**
     * Triggered after the dock config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDock(value, oldValue) {
        let me            = this,
            {cls}         = me,
            dockPositions = me.getStaticConfig('dockPositions');

        dockPositions.forEach(key => {
            key !== null && NeoArray[key === value ? 'add' : 'remove'](cls, 'neo-dock-' + key)
        });

        me.cls    = cls;
        me.layout = me.getLayoutConfig()
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        let me = this;

        if (value && !me.sortZone) {
            import('../draggable/toolbar/SortZone.mjs').then(module => {
                me.sortZone = Neo.create({
                    module             : module.default,
                    appName            : me.appName,
                    boundaryContainerId: me.id,
                    owner              : me,
                    windowId           : me.windowId,
                    ...me.sortZoneConfig
                })
            })
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (this.sortZone) {
            this.sortZone.windowId = value
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
            items.map(item => this.replaceSpacer(item))
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
            switch(me.dock) {
                case 'bottom':
                case 'top':
                    layoutConfig = {
                        ntype: 'hbox',
                        align: 'center',
                        pack : 'start'
                    };
                    break
                case 'left':
                    layoutConfig = {
                        ntype    : 'vbox',
                        align    : 'center',
                        direction: 'column-reverse',
                        pack     : 'start'
                    };
                    break
                case 'right':
                    layoutConfig = {
                        ntype    : 'vbox',
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
            item.map(item => this.replaceSpacer(item))
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
}

export default Neo.setupClass(Base);
