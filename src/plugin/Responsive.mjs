import Plugin from './Base.mjs';

/**
 * @class Neo.plugin.Responsive
 * @extends Neo.plugin.Base
 */
class Responsive extends Plugin {
    /**
     * Per-window registry tracking whether a viewport resize listener for `document.body` orientation classes is active.
     * @member {Object} apps={}
     * @static
     */
    static apps = {}

    static config = {
        /**
         * @member {String} className='Neo.plugin.Responsive'
         * @protected
         */
        className: 'Neo.plugin.Responsive',
        /**
         * @member {String} ntype='plugin-responsive'
         * @protected
         */
        ntype: 'plugin-responsive',
        /**
         * @member {Map|null} responsiveConfig=null
         */
        responsiveConfig: null,
        /**
         * @member {Neo.container.Viewport|null} viewport=null
         * @protected
         */
        viewport: null,
        /**
         * @member {Object} defaultResponsiveConfig
         */
        defaultResponsiveConfig: {
            landscape(data) {
                return data.width > data.height
            },
            portrait(data) {
                return data.width < data.height
            }
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me;

        me.responsiveConfig = new Map();

        owner.addCls('neo-responsive');

        me.addToResponsiveMap(me.defaultResponsiveConfig, me);
        me.addToResponsiveMap(owner.responsiveConfig || {}, owner);

        // plugin.Base#construct calls onOwnerMounted() immediately when mounted and subscribes only when unmounted
        if (owner.mounted) {
            owner.on('mounted', me.onOwnerMounted, me)
        }
    }

    /**
     * @param {Object} responsiveObj
     * @param {Object} scope
     */
    addToResponsiveMap(responsiveObj, scope) {
        for (const [key, value] of Object.entries(responsiveObj)) {
            let fn;

            if (Neo.isObject(value)) {
                fn = function (rect) {
                    let returnBool = true;

                    for (const [subKey, subValue] of Object.entries(value)) {
                        const isMin      = subKey.startsWith('min'),
                              testConfig = subKey.substring(3).toLowerCase();

                        if (isMin) {
                            returnBool = rect[testConfig] >= subValue
                        } else {
                            returnBool = rect[testConfig] <= subValue
                        }

                        if (!returnBool) {
                            break
                        }
                    }

                    return returnBool
                }
            } else {
                fn = value
            }

            fn = fn.bind(scope);

            this.responsiveConfig.set(key, fn)
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.owner?.un('mounted', me.onOwnerMounted, me);

        if (me.viewport) {
            me.viewport.un('resize', me.onResize, me);
            me.viewport = null
        }

        super.destroy(...args)
    }

    /**
     * @summary Resolves the Viewport instance owning this plugin's component across multi-window and custom-viewport apps.
     * @returns {Neo.container.Viewport|null}
     */
    getViewport() {
        let {owner}  = this,
            mainView = owner.app?.mainView;

        return owner.up('viewport')
            || (mainView?.ntype === 'viewport' ? mainView : mainView?.down('viewport'))
            || Neo.first('viewport')
    }

    /**
     * @summary Ensures one Viewport resize listener per window updates `document.body` orientation classes.
     * @param {Neo.container.Viewport|null} [viewport=this.getViewport()]
     */
    handleBodyCls(viewport=this.getViewport()) {
        const
            me         = this,
            {windowId} = me.owner,
            {apps}     = me.constructor;

        if (viewport && !apps[windowId]?.activeBodyUpdate) {
            apps[windowId] = {
                appId           : viewport.id,
                activeBodyUpdate: true
            };

            viewport.monitorSize = true;
            viewport.on('resize', me.onResizeBody, me)
        }
    }

    /**
     * @summary Subscribes to the owning window's Viewport resize event on mount and rebinds across window moves.
     * @param {Boolean} [mounted=true]
     */
    onOwnerMounted(mounted=true) {
        if (!mounted) {
            return
        }

        let me       = this,
            viewport = me.getViewport();

        if (!viewport) {
            return
        }

        if (me.viewport && me.viewport !== viewport) {
            me.viewport.un('resize', me.onResize, me)
        }

        if (me.viewport !== viewport) {
            me.viewport          = viewport;
            viewport.monitorSize = true;
            viewport.on('resize', me.onResize, me)
        }

        me.handleBodyCls(viewport)
    }

    /**
     * Applies the owner's current `responsive` value. An owner that turned it off keeps this plugin idle until the next
     * value arrives.
     * @param {Object} data
     */
    onResize(data) {
        const
            me           = this,
            config       = {},
            configTester = me.responsiveConfig,
            {owner}      = me,
            {responsive} = owner;

        if (!responsive) {
            return
        }

        for (const [key, value] of Object.entries(responsive)) {
            const hasKey = configTester.get(key)?.(data.rect);

            if (hasKey) {
                for (const [configKey, configValue] of Object.entries(value)) {
                    if (false && Neo.typeOf(owner[configKey]) === 'NeoInstance') {
                        // todo: ntype, module or className must match
                        owner[configKey].set(value)
                    } else {
                        config[configKey] = configValue
                    }
                }
            }
        }

        Object.keys(config).length > 0 && owner.set(config)
    }

    /**
     * Add either neo-landscape or neo-portrait to the parent viewport component
     */
    onResizeBody(data) {
        const
            me          = this,
            newRect     = data.contentRect,
            isLandscape = newRect.width >= newRect.height,
            addCls      = isLandscape ? 'neo-landscape' : 'neo-portrait',
            removeCls   = isLandscape ? 'neo-portrait' : 'neo-landscape';

        Neo.applyDeltas(me.appName, {
            id : 'document.body',
            cls: {
                add   : [addCls],
                remove: [removeCls]
            }
        })
    }
}

export default Neo.setupClass(Responsive);
