import Base     from '../core/Base.mjs';
import NeoArray from '../util/Array.mjs';

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
            {container, containerCls} = me,
            {wrapperCls}              = container;

        if (containerCls) {
            if (!container) {
                Neo.logError(me.className + ': applyRenderAttributes -> container not yet created', me.containerId)
            }

            NeoArray.add(wrapperCls, containerCls);

            container[silent ? 'setSilent' :  'set']({wrapperCls})
        }
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

        me.bind && me.container.getStateProvider()?.parseConfig(me)
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
        let me                        = this,
            {container, containerCls} = me,
            {wrapperCls}              = container;

        if (containerCls) {
            if (!container) {
                Neo.logError(me.className + ': removeRenderAttributes -> container not yet created', me.containerId)
            }

            NeoArray.remove(wrapperCls, containerCls);

            container.wrapperCls = wrapperCls
        }
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
     * Convenience shortcut calling set() with the silent flag
     * @param {Object} values={}
     */
    setSilent(values={}) {
        return this.set(values, true)
    }
}

export default Neo.setupClass(Layout);
