import Base from '../core/Base.mjs';

/**
 * Abstract base class for plugin implementations.
 * Plugins are intended to get put into the plugins config of component.Base
 * to enhance them or add additional features
 * @class Neo.plugin.Base
 * @extends Neo.core.Base
 */
class Plugin extends Base {
    static config = {
        /**
         * @member {String} className='Neo.plugin.Base'
         * @protected
         */
        className: 'Neo.plugin.Base',
        /**
         * All plugin ntypes need to start with 'plugin-' to ensure that component.Base: getPlugin() can find them
         * @member {String} ntype='plugin'
         * @protected
         */
        ntype: 'plugin',
        /**
         * @member {Neo.component.Base} owner=null
         * @protected
         */
        owner: null,
        /**
         * @member {Number|null} windowId_=null
         * @reactive
         */
        windowId_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me;

        if (owner.isConstructed) {
            me.onOwnerConstructed()
        } else {
            owner.on('constructed', () => {
                me.onOwnerConstructed()
            }, me, {once: true})
        }

        // Deliberately NOT `{once: true}`, unlike `constructed` six lines up. Bounding this was
        // measured and reverted: `component/SplitterHeavyContent` remounts on purpose and went red
        // with `compareAttributes` reading `aria-colcount` off undefined, so a plugin re-applying on
        // remount is load-bearing for vdom structure. A duplicate-registration problem in an
        // override is the override's to make idempotent, not this subscription's to bound.
        if (owner.mounted) {
            me.onOwnerMounted();
        } else {
            owner.on('mounted', me.onOwnerMounted, me);
        }
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        value && Neo.currentWorker.insertThemeFiles(value, this.__proto__)
    }

    /**
     * A plugin destroyed while its owner lives leaves the owner's `plugins`, so `getPlugin()` stops finding it. An
     * owner being destroyed destroys every plugin it holds.
     * @param {Array} args
     */
    destroy(...args) {
        let me      = this,
            {owner} = me;

        // A plugin created with an owner, rather than through its plugins config, is not listed there
        if (!owner.isDestroying && !owner.isDestroyed && owner.plugins?.includes(me)) {
            owner.plugins = owner.plugins.filter(plugin => plugin !== me)
        }

        super.destroy(...args)
    }

    /**
     * Override this method to apply changes to the owner Component when it is constructed
     */
    onOwnerConstructed() {
        let {owner} = this;

        if (owner.windowId) {
            this.windowId = owner.windowId
        }
    }

    /**
     * Override this method to apply changes to the owner Component when it does get mounted
     */
    onOwnerMounted() {

    }
}

export default Neo.setupClass(Plugin);
