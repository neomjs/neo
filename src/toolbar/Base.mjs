import Button         from '../button/Base.mjs';
import Component      from '../component/Base.mjs';
import Container      from '../container/Base.mjs';
import Label          from '../component/Label.mjs';
import NeoArray       from '../util/Array.mjs';
import {isDescriptor} from '../core/ConfigSymbols.mjs';

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
         * Named action config factories. Subclasses can provide reusable action vocabularies while
         * instance-level action objects remain fully customisable.
         * @member {Object|null} actionMap=null
         */
        actionMap: null,
        /**
         * Defaults applied to every materialised action before its own config. A caller-provided
         * handler deliberately wins over the toolbar's generic intent emitter.
         * @member {Object|null} actionDefaults=null
         */
        actionDefaults: null,
        /**
         * Optional flat action configs appended after one toolbar-owned flex spacer.
         * @member {Object[]|String[]|null} actions=null
         * @reactive
         */
        actions_: {
            [isDescriptor]: true,
            clone         : 'shallow',
            cloneOnGet    : 'none',
            isEqual       : () => false,
            value         : null
        },
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
         * Whether focus-contextual actions are currently exposed. Inactive contextual actions keep
         * their layout extent but leave pointer, keyboard, and accessibility navigation.
         * @member {Boolean} contextualActionsVisible=false
         * @reactive
         */
        contextualActionsVisible_: false,
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
     * Reconciles a live action-collection replacement after construction. Initial materialisation
     * stays inside createItems() so the toolbar still commits one child tree.
     * @param {Object[]|String[]|null} value
     * @param {Object[]|String[]|null} oldValue
     * @protected
     */
    afterSetActions(value, oldValue) {
        oldValue !== undefined && this.isConstructed && this.syncActions(value)
    }

    /**
     * Applies focus-context visibility without changing each action's consumer-owned hidden or
     * disabled state.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetContextualActionsVisible(value, oldValue) {
        oldValue !== undefined && this.isConstructed && this.applyContextualActionState()
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
        let me    = this,
            items = me._items;

        if (Array.isArray(items)) {
            me._items = [
                ...items.map(item => me.replaceSpacer(item)),
                ...me.createActionItemConfigs()
            ]
        }

        super.createItems();

        me.bindActionItems();
        me.applyContextualActionState(true)
    }

    /**
     * Reserves or releases contextual action interactivity while preserving layout geometry.
     * @param {Boolean} [silent=false]
     */
    applyContextualActionState(silent=false) {
        let me      = this,
            visible = me.contextualActionsVisible;

        me.getActionItems().forEach(item => {
            if (item.contextual !== true) {
                return
            }

            let cls      = [...(item.cls || [])],
                inactive = !visible,
                vdom     = item.vdom;

            NeoArray.toggle(cls, 'neo-toolbar-action-context-inactive', inactive);
            item.setSilent({cls});

            if (inactive) {
                if (!Object.hasOwn(item, '_toolbarActionTabIndex')) {
                    item._toolbarActionTabIndex = Object.hasOwn(vdom, 'tabIndex') ? vdom.tabIndex : null
                }

                vdom['aria-hidden'] = 'true';
                vdom.inert         = true;
                vdom.tabIndex      = -1
            } else {
                delete vdom['aria-hidden'];
                delete vdom.inert;

                if (item._toolbarActionTabIndex === null) {
                    delete vdom.tabIndex
                } else {
                    vdom.tabIndex = item._toolbarActionTabIndex
                }

                delete item._toolbarActionTabIndex
            }

            !silent && item.update()
        })
    }

    /**
     * Observes availability changes whose geometry can alter a consumer such as tab overflow.
     * @protected
     */
    bindActionItems() {
        let me = this;

        me.getActionItems().forEach(item => {
            item.addDomListeners({resize: me.onActionResize, scope: me});
            item.on('hiddenChange', () => {
                me.fire('actionVisibilityChange', {action: item.action, component: item})
            }, me)
        })
    }

    /**
     * Publishes post-render action-root geometry changes for consumers whose available extent is
     * independent of the toolbar's own border box.
     * @param {Object} data
     * @protected
     */
    onActionResize(data) {
        let {component} = data;

        this.fire('actionGeometryChange', {
            action: component.action,
            component
        })
    }

    /**
     * Builds one action button config while preserving explicit-handler precedence.
     * @param {Object|String} action
     * @returns {Object}
     * @protected
     */
    createActionItemConfig(action) {
        let me       = this,
            resolved = action,
            cls,
            vdom;

        if (Neo.typeOf(action) !== 'Object') {
            let factory = me.actionMap?.[action];

            if (!Neo.isFunction(factory)) {
                throw new Error(me.className + ': unknown toolbar action "' + action + '"')
            }

            resolved = factory()
        }

        resolved = {...resolved};
        cls      = Array.isArray(resolved.cls) ? [...resolved.cls] : resolved.cls ? [resolved.cls] : [];
        vdom     = {...(resolved.vdom || {})};

        NeoArray.add(cls, 'neo-toolbar-action');

        if (resolved.iconCls && !resolved.text && !vdom['aria-label'] && !vdom['aria-labelledby']) {
            if (!resolved.action) {
                throw new Error(me.className + ': icon-only toolbar actions require an action or accessible name')
            }

            vdom['aria-label'] = String(resolved.action).replace(/[-_]+/g, ' ')
        }

        return {
            role: 'button',
            ...(me.actionDefaults || {}),
            handler: me.fireAction.bind(me),
            ...resolved,
            cls,
            isToolbarAction: true,
            ...(Object.keys(vdom).length > 0 && {vdom})
        }
    }

    /**
     * Materialises the toolbar-owned spacer plus action configs.
     * @param {Object[]|String[]|null} [actions=this.actions]
     * @returns {Object[]}
     * @protected
     */
    createActionItemConfigs(actions=this.actions) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return []
        }

        return [{
            module               : Component,
            cls                  : ['neo-toolbar-action-spacer'],
            flex                 : 1,
            isToolbarActionSpacer: true
        }, ...actions.map(action => this.createActionItemConfig(action))]
    }

    /**
     * Emits generic action intent. Specialised toolbars can override this method to retain an
     * established event contract.
     * @param {Object} data
     */
    fireAction(data) {
        let {component} = data;

        this.fire('action', {
            action: component.action,
            component,
            scope : this
        })
    }

    /**
     * Returns the stable action component instances owned by this toolbar.
     * @returns {Neo.component.Base[]}
     */
    getActionItems() {
        return (this.items || []).filter(item => item.isToolbarAction === true)
    }

    /**
     * Returns a stable action instance by semantic action name.
     * @param {String} action
     * @returns {Neo.component.Base|null}
     */
    getActionItem(action) {
        return this.getActionItems().find(item => item.action === action) || null
    }

    /**
     * Returns the spacer owned by the action group.
     * @returns {Neo.component.Base|null}
     * @protected
     */
    getActionSpacer() {
        return (this.items || []).find(item => item.isToolbarActionSpacer === true) || null
    }

    /**
     * Replaces only the toolbar-owned action group while preserving every ordinary item.
     * @param {Object[]|String[]|null} actions
     * @protected
     */
    syncActions(actions) {
        let me      = this,
            owned   = [me.getActionSpacer(), ...me.getActionItems()].filter(Boolean),
            configs = me.createActionItemConfigs(actions);

        owned
            .map(item => me.items.indexOf(item))
            .filter(index => index > -1)
            .sort((a, b) => b - a)
            .forEach(index => me.removeAt(index, true, true));

        if (configs.length > 0) {
            me.insert(me.items.length, configs);
            me.bindActionItems();
            me.applyContextualActionState(true)
        } else {
            me.updateDepth = -1;
            me.update()
        }

        me.fire('actionsChange', {actions: me.getActionItems()})
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
     * @param {Boolean} [removeFromPreviousParent=true]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    insert(index, item, silent=false, removeFromPreviousParent=true) {
        if (Array.isArray(item)) {
            item = item.map(item => this.replaceSpacer(item))
        } else {
            item = this.replaceSpacer(item)
        }

        return super.insert(index, item, silent, removeFromPreviousParent)
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
