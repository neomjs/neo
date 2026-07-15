import Base     from '../core/Base.mjs';
import NeoArray from '../util/Array.mjs';

const
    fallbackWrapperStates = new WeakMap(),
    normalizeClassNames   = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))],
    wrapperClsOwner       = Symbol('layout.Base.wrapperCls');

const reconcileFallbackAuthored = (state, current) => {
    const owned = new Set([...state.contributions.values()].flat());

    state.authored = normalizeClassNames([
        ...state.authored.filter(cls => current.includes(cls)),
        ...current.filter(cls => !owned.has(cls))
    ])
};

/**
 * The base class for all other layouts.
 * Use it directly in case you want to create a container without a layout.
 * @class Neo.layout.Base
 * @extends Neo.core.Base
 */
class Layout extends Base {
    static config = {
        /**
         * @member {String} className='Neo.layout.Base'
         * @protected
         */
        className: 'Neo.layout.Base',
        /**
         * @member {String} ntype='layout-base'
         * @protected
         */
        ntype: 'layout-base',
        /**
         * The name of the App this layout belongs to
         * @member {String|null} appName_=null
         * @reactive
         */
        appName_: null,
        /**
         * The id of the Container instance this layout is bound to
         * @member {?String} containerId=null
         * @protected
         */
        containerId: null,
        /**
         * A layout specific CSS selector which gets added to Container the layout is bound to.
         * @member {String|null} containerCls_=null
         * @protected
         * @reactive
         */
        containerCls_: null,
        /**
         * Identifier for all classes that extend layout.Base
         * @member {Boolean} isLayout=true
         * @protected
         */
        isLayout: true,
        /**
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * @returns {Neo.container.Base|null}
     */
    get container() {
        let {containerId} = this;

        // the instance might not be registered yet
        return Neo.getComponent(containerId) || Neo.get(containerId)
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * Placeholder method
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @protected
     */
    applyChildAttributes(item, index) {}

    /**
     * @param {Boolean} silent=false
     * @protected
     */
    applyRenderAttributes(silent=false) {
        let me                        = this,
            {container, containerCls} = me;

        if (!container) {
            Neo.logError(me.className + ': applyRenderAttributes -> container not yet created', me.containerId)
        }

        me.setItemWrapperClsContribution(container, wrapperClsOwner, containerCls ? [containerCls] : [], silent)
    }

    /**
     *
     */
    destroy() {
        let me = this;

        me.bind && me.getStateProvider()?.removeBindings(me.id);

        super.destroy()
    }

    /**
     * Returns the container stateProvider or its closest parent stateProvider
     * @param {String} [ntype]
     * @returns {Neo.state.Provider|null}
     */
    getStateProvider(ntype) {
        return this.container.getStateProvider(ntype)
    }

    /**
     * Applies all class configs to this instance
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     */
    initConfig(config, preventOriginalConfig) {
        super.initConfig(config, preventOriginalConfig);

        let me = this;

        me.bind && me.container.getStateProvider()?.createBindings(me)
    }

    /**
     * Placeholder method
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @protected
     */
    removeChildAttributes(item, index) {}

    /**
     * @protected
     */
    removeRenderAttributes() {
        let me          = this,
            {container} = me;

        if (!container) {
            Neo.logError(me.className + ': removeRenderAttributes -> container not yet created', me.containerId)
        }

        me.setItemWrapperClsContribution(container, wrapperClsOwner, [])
    }

    /**
     * Change multiple configs at once, ensuring that all afterSet methods get all new assigned values
     * @param {Object} values={}
     * @param {Boolean} silent=false
     * @returns {Promise<*>}
     */
    set(values={}, silent=false) {
        let me          = this,
            {container} = me;

        container.silentVdomUpdate = true;

        super.set(values);

        container.silentVdomUpdate = false;

        if (silent || !container.needsVdomUpdate) {
            return Promise.resolve()
        } else {
            return container.promiseUpdate()
        }
    }

    /**
     * Replaces one layout owner's wrapper class contribution on a container item.
     * @summary Keeps full components owner-aware while preserving functional and lightweight item compatibility.
     * @param {Neo.component.Base|Object} item
     * @param {*}                         owner Stable owner key.
     * @param {String[]|String|null}     value
     * @param {Boolean}                  [silent=false]
     * @returns {Boolean} True when the contribution changed.
     * @protected
     */
    setItemWrapperClsContribution(item, owner, value, silent=false) {
        if (typeof item.setWrapperClsContribution === 'function') {
            return item.setWrapperClsContribution(owner, value, silent)
        }

        let current = normalizeClassNames(item.wrapperCls),
            next    = normalizeClassNames(value),
            state   = fallbackWrapperStates.get(item),
            previous, wrapperCls;

        if (!state) {
            state = {
                aggregate    : current,
                authored     : current,
                contributions: new Map()
            };
            fallbackWrapperStates.set(item, state)
        } else if (!Neo.isEqual(current, state.aggregate)) {
            reconcileFallbackAuthored(state, current)
        }

        previous = state.contributions.get(owner) || [];

        if (Neo.isEqual(next, previous) && Neo.isEqual(current, state.aggregate)) {
            return false
        }

        if (next.length) {
            state.contributions.set(owner, next)
        } else {
            state.contributions.delete(owner)
        }

        wrapperCls = [...state.authored];
        state.contributions.forEach(contribution => NeoArray.add(wrapperCls, contribution));
        state.aggregate = wrapperCls;

        if (silent && typeof item.setSilent === 'function') {
            item.setSilent({wrapperCls})
        } else {
            item.wrapperCls = wrapperCls
        }

        if (!state.contributions.size) {
            fallbackWrapperStates.delete(item)
        }

        return true
    }

    /**
     * Convenience shortcut calling set() with the silent flag
     * @param {Object} values={}
     */
    setSilent(values={}) {
        return this.set(values, true)
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            appName     : me.appName,
            containerCls: me.containerCls,
            containerId : me.containerId,
            windowId    : me.windowId
        }
    }
}

export default Neo.setupClass(Layout);
