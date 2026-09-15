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

        // `{once: true}` for the same reason `constructed` carries it six lines up, and because
        // without it the two branches disagreed: a plugin built AFTER its owner mounted took the
        // fast path and never re-ran, while one built before re-ran on every remount. Both
        // overrides in the tree register listeners and observers, so the re-run was not a contract
        // anyone relied on — it duplicated seven `tab.plugin.Overflow` registrations per remount.
        if (owner.mounted) {
            me.onOwnerMounted();
        } else {
            owner.on('mounted', me.onOwnerMounted, me, {once: true});
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
