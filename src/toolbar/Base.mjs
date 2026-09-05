import ActionButton   from './ActionButton.mjs'; // the ntype an action config may resolve to
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
         * Optional flat action configs appended after one toolbar-owned flex spacer. An action's `action`
         * name is its address ({@link #getAction}) and is unique within the toolbar: a name repeated here,
         * or already held by a contributed action, throws when the actions materialise.
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
         * Whether focus-gated actions are currently exposed. An inactive action keeps its instance,
         * its listeners and its place in the actions array, but has no DOM node: it occupies no
         * layout, and no consumer stylesheet can give it a box back. See
         * {@link #applyContextualActionState} for the invariant and its mechanism.
         *
         * Driven by {@link #focusSubjectId}; a composition may still set it directly when its
         * exposing signal is not a focus event.
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
         * Component whose focus exposes this toolbar's `showOnFocus` actions. `null` resolves to the
         * toolbar's parent container — for a tab header toolbar that is the TabContainer itself.
         *
         * One subject covers both edges, and that is a property of `manager.Focus` rather than a
         * simplification: it fires `focusEnter` / `focusLeave` only up to the closest component
         * common to the old and new paths. Focus moving anywhere INSIDE the subject — including onto
         * one of these actions — never fires `focusLeave` on it, so an action cannot vanish from
         * under the pointer reaching for it. Only leaving the subject entirely re-hides them.
         * @member {String|null} focusSubjectId=null
         */
        focusSubjectId: null,
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
     * Action instances whose resize / visibility signals are already bound. Contributions survive
     * consumer action rebuilds, so binding by collection pass would otherwise multiply listeners.
     * @member {WeakSet<Neo.component.Base>}
     * @protected
     */
    actionBindingItems = new WeakSet()

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
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        value && this.wireFocusSubject()
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
     * @protected
     */
    onConstructed() {
        super.onConstructed();

        this.wireFocusSubject()
    }

    /**
     * Offers or withdraws the contextual actions. A withdrawn action is removed from the DOM, not
     * merely made invisible: the rail must not encode absent affordances as empty space, and the
     * removal has to hold against consumer CSS of any weight.
     *
     * The invariant: a context-inactive action occupies no layout, and consumer CSS cannot make it
     * occupy layout again. A class-driven `display: none` cannot promise that — any viewport-scoped
     * consumer rule on `.neo-toolbar-action` outranks it silently, and escalating specificity only
     * moves the tie to the next consumer. So the collapse is expressed through the component's own
     * absence primitive, the `vdom.removeDom` marker that `hidden` uses under
     * `hideMode: 'removeDom'`, on the retained instance: same instance, same listeners, same place
     * in the actions array, no node. A consumer may style `.neo-toolbar-action` freely — hit areas,
     * rest and hover paint — without knowing the collapse exists. The
     * `neo-toolbar-action-context-inactive` class stays on the instance as the measurement marker
     * `Neo.tab.plugin.Overflow` filters by; it never reaches a rendered node.
     *
     * DOM presence is layered, never shared. The toolbar owns the presence of a WITHDRAWN action
     * and hands it back to the consumer's own `hidden` on reveal, so a `hidden: true` action stays
     * absent when focus arrives and a `hidden: false` one returns. The hold is the component's own
     * `domWithheld`: `show()` leaves the marker in place while it is raised, on every un-hide path —
     * including the second `show()` a batched `set()` runs after its silent pass, which fires past
     * any `hiddenChange` listener and is why a re-stamp from the toolbar could never be the last
     * writer.
     * @param {Boolean} [silent=false] Stamp the vdom only; the caller owns the update.
     */
    applyContextualActionState(silent=false) {
        let me      = this,
            visible = me.contextualActionsVisible,
            touched = false;

        me.getActionItems().forEach(item => {
            let focusGated      = me.isFocusGatedAction(item),
                ownsInactiveTab = Object.hasOwn(item, '_toolbarActionTabIndex');

            // A live action may leave the focus gate so a persistent protective state can keep its
            // reversal discoverable. If this toolbar previously made it inactive, the opt-out must
            // release that owned layer once; a persistent action that was never gated stays
            // untouched, including any consumer-owned inert/aria state.
            if (!focusGated && !ownsInactiveTab) {
                return
            }

            let cls      = [...(item.cls || [])],
                inactive = focusGated && !visible,
                vdom     = item.vdom;

            NeoArray.toggle(cls, 'neo-toolbar-action-context-inactive', inactive);
            item.setSilent({cls});

            if (inactive) {
                if (!Object.hasOwn(item, '_toolbarActionTabIndex')) {
                    item._toolbarActionTabIndex = Object.hasOwn(vdom, 'tabIndex') ? vdom.tabIndex : null
                }

                vdom['aria-hidden'] = 'true';
                vdom.inert         = true;
                vdom.tabIndex      = -1;
                item.domWithheld   = true;
                vdom.removeDom     = true
            } else {
                delete vdom['aria-hidden'];
                delete vdom.inert;

                if (ownsInactiveTab) {
                    if (item._toolbarActionTabIndex === null) {
                        delete vdom.tabIndex
                    } else {
                        vdom.tabIndex = item._toolbarActionTabIndex
                    }

                    delete item._toolbarActionTabIndex
                }

                item.domWithheld = false;
                me.syncActionDomPresence(item)
            }

            touched = true
        });

        // One update at the owner: a child cannot re-insert its own removed node, and the parent
        // diff is what carries the removals and the returns alike.
        if (touched && !silent) {
            me.updateDepth = -1;
            me.update()
        }
    }

    /**
     * Restores a revealed action's DOM presence to what its consumer decided: `hidden` under
     * `hideMode: 'removeDom'` keeps the node out, anything else brings it back.
     * @param {Neo.component.Base} item
     * @protected
     */
    syncActionDomPresence(item) {
        if (item.hidden && item.hideMode !== 'visibility') {
            item.vdom.removeDom = true
        } else {
            delete item.vdom.removeDom
        }
    }

    /**
     * Whether one action item is gated on the focus subject.
     *
     * One key decides it. `contextual` is the deprecated spelling and is an INPUT alias only:
     * {@link #createActionItemConfig} resolves it into `showOnFocus` and deletes it, so no instance
     * ever carries both and no reader has to know which spelling won.
     *
     * A PRESSED action leaves the gate: while a persistent state holds, the affordance that
     * reverses it stays offered, so discoverability never depends on re-entering a transient focus
     * context. The consumer's declared `showOnFocus` is never rewritten to express that — it says
     * what the resting action wants, and the effective gate is derived here.
     * @param {Neo.component.Base} item
     * @returns {Boolean}
     * @protected
     */
    isFocusGatedAction(item) {
        return item.showOnFocus === true && item.pressed !== true
    }

    /**
     * Subscribes the focus gate to its subject.
     *
     * Idempotent and safe to call early: the subject may not exist yet when a toolbar is built as
     * an early child, so the first attempt can resolve nothing. It then leaves the toolbar unwired
     * rather than marking it done, and the owner's `onConstructed` or this toolbar's mount retries.
     * Binding once at a single moment would be either too early for the subject or too late for a
     * toolbar that never mounts.
     * @protected
     */
    wireFocusSubject() {
        let me = this;

        if (me.focusSubjectWired) {
            return
        }

        let subject = me.focusSubjectId ? Neo.getComponent(me.focusSubjectId) : me.parent;

        if (!subject) {
            return
        }

        me.focusSubjectWired = true;

        // `containsFocus` is a reactive config that `manager.Focus` already maintains on every
        // component in the focus path, so the gate is a subscription to existing state rather than
        // a second interpretation of focus events. `observeConfig()` also ties the subscription to
        // this toolbar's lifecycle, which hand-rolled listeners do not.
        me.observeConfig(subject, 'containsFocus', value => {
            me.contextualActionsVisible = value === true
        });

        // Wiring can land after the subject already holds focus; the subscription only reports
        // CHANGES, so the current value has to be adopted once.
        me.contextualActionsVisible = subject.containsFocus === true
    }

    /**
     * Observes availability changes whose geometry can alter a consumer such as tab overflow.
     * @protected
     */
    bindActionItems(items=this.getActionItems()) {
        let me = this;

        items.forEach(item => {
            if (me.actionBindingItems.has(item)) {
                return
            }

            me.actionBindingItems.add(item);
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

        let defaults = me.actionDefaults || {};

        let config = {
            role: 'button',
            ...defaults,
            handler: me.fireAction.bind(me),
            ...resolved,
            cls,
            isToolbarAction: true,
            ...(Object.keys(vdom).length > 0 && {vdom})
        };

        // The gate is normalized to exactly ONE key, so nothing downstream has to reconcile two
        // spellings. Precedence is explicit rather than positional, because the spread cannot express
        // it: `showOnFocus` and `contextual` are different keys, so BOTH survive it and the
        // deprecated one would decide whenever it happened to be truthy — including when both arrive
        // from `actionDefaults`, where there is no "own" value to prefer.
        //
        // Nearest wins, current name before the alias: the action's own `showOnFocus`, then its
        // `contextual`, then the defaults' `showOnFocus`, then the defaults' `contextual`.
        let gate = Object.hasOwn(resolved,  'showOnFocus') ? resolved.showOnFocus  === true :
                   Object.hasOwn(resolved,  'contextual')  ? resolved.contextual   === true :
                   Object.hasOwn(defaults,  'showOnFocus') ? defaults.showOnFocus  === true :
                   Object.hasOwn(defaults,  'contextual')  ? defaults.contextual   === true :
                   undefined;

        // `contextual` is an INPUT alias only; it never survives onto the instance.
        delete config.contextual;

        gate === undefined ? delete config.showOnFocus : (config.showOnFocus = gate);

        return config
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

        let configs = actions.map(action => this.createActionItemConfig(action));

        this.assertUniqueActionNames(configs);

        return [this.createActionSpacerConfig(), ...configs]
    }

    /**
     * Refuses a repeated action name before anything is inserted. A name addresses exactly one action
     * ({@link #getAction}); two actions sharing it would leave one unaddressable and route every intent by
     * that name to the other. Unnamed actions cannot be addressed, so they cannot collide.
     * @param {Object[]} configs The action configs about to be inserted.
     * @param {Neo.component.Base[]} [existing=[]] Action instances that stay in place beside them.
     * @protected
     */
    assertUniqueActionNames(configs, existing=[]) {
        let names = new Set(existing.map(item => item.action).filter(Boolean));

        configs.forEach(({action}) => {
            if (action) {
                if (names.has(action)) {
                    throw new Error(this.className + ': duplicate toolbar action "' + action + '"')
                }

                names.add(action)
            }
        })
    }

    /**
     * Returns the toolbar-owned spacer config shared by consumer actions and contributed actions.
     * @returns {Object}
     * @protected
     */
    createActionSpacerConfig() {
        return {
            module               : Component,
            cls                  : ['neo-toolbar-action-spacer'],
            flex                 : 1,
            isToolbarActionSpacer: true
        }
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
     * Adds one toolbar-owned action contribution ahead of consumer actions. Contributions are not
     * written into {@link #actions}; the consumer remains the sole owner of that config, while the
     * toolbar preserves the contributed instance across every consumer action rebuild.
     * @param {Object} config Action config.
     * @returns {Neo.component.Base} The stable contributed action instance.
     */
    addActionContribution(config) {
        let me            = this,
            actionItems   = me.getActionItems(),
            firstAction   = actionItems[0],
            firstConsumer = actionItems.find(item => item.isToolbarActionContribution !== true),
            spacer        = me.getActionSpacer(),
            contribution;

        me.assertUniqueActionNames([config], actionItems);

        if (!spacer) {
            spacer = me.insert(firstAction ? me.items.indexOf(firstAction) : me.items.length,
                me.createActionSpacerConfig(), true)
        }

        firstConsumer = me.getActionItems().find(item => item.isToolbarActionContribution !== true);
        contribution  = me.insert(firstConsumer ? me.items.indexOf(firstConsumer) : me.items.length,
            me.createActionItemConfig({...config, isToolbarActionContribution: true}));

        me.bindActionItems([contribution]);
        me.applyContextualActionState(true);
        me.fire('actionsChange', {actions: me.getActionItems()});

        return contribution
    }

    /**
     * Returns action instances contributed outside the consumer-owned {@link #actions} config.
     * @returns {Neo.component.Base[]}
     */
    getActionContributionItems() {
        return this.getActionItems().filter(item => item.isToolbarActionContribution === true)
    }

    /**
     * Returns the stable action component instances owned by this toolbar.
     * @returns {Neo.component.Base[]}
     */
    getActionItems() {
        return (this.items || []).filter(item => item.isToolbarAction === true)
    }

    /**
     * Returns the action instance addressed by its `action` name — the toolbar's counterpart of
     * `getPlugin`, `getController` and `getReference`. Names are unique within a toolbar
     * ({@link #assertUniqueActionNames}); an unnamed action is not addressable, so no name resolves nothing.
     * @param {String} name
     * @returns {Neo.component.Base|null}
     */
    getAction(name) {
        if (typeof name !== 'string' || name === '') {
            return null
        }

        return this.getActionItems().find(item => item.action === name) || null
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
     * Retires one contributed action instance. The toolbar's ordinary item-destruction path owns
     * contributions during toolbar teardown; contributors use this method for earlier retirement.
     * @param {Neo.component.Base} instance
     * @returns {Neo.component.Base|null}
     */
    removeActionContribution(instance) {
        let me = this;

        if (instance?.isToolbarActionContribution !== true || !me.items.includes(instance)) {
            return null
        }

        me.remove(instance, true, true);

        if (me.getActionItems().length === 0) {
            let spacer = me.getActionSpacer();

            spacer && me.remove(spacer, true, true)
        }

        me.updateDepth = -1;
        me.update();
        me.fire('actionsChange', {actions: me.getActionItems()});

        return instance
    }

    /**
     * Replaces only the toolbar-owned action group while preserving every ordinary item.
     * @param {Object[]|String[]|null} actions
     * @protected
     */
    syncActions(actions) {
        let me            = this,
            contributions = me.getActionContributionItems(),
            owned         = contributions.length > 0
                ? me.getActionItems().filter(item => item.isToolbarActionContribution !== true)
                : [me.getActionSpacer(), ...me.getActionItems()].filter(Boolean),
            configs       = contributions.length > 0
                ? Array.isArray(actions) && actions.length > 0
                    ? actions.map(action => me.createActionItemConfig(action))
                    : []
                : me.createActionItemConfigs(actions);

        // The consumer actions are rebuilt whole, so they are checked among themselves inside
        // createActionItemConfigs; against the contributions that stay, they are checked here.
        contributions.length > 0 && me.assertUniqueActionNames(configs, contributions);

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
