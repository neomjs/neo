import BasePlugin from './Base.mjs';

/**
 * @class Neo.plugin.Responsive
 * @extends Neo.plugin.Base
 */
class Responsive extends BasePlugin {
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
         * @member {Map} responsiveConfig: new Map()
         */
        responsiveConfig: new Map(),
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

        let me = this;

        me.owner.addCls('neo-responsive');

        Neo.first('viewport').addDomListeners([
            {resize: me.onResize, scope: me}
        ])

        Neo.Responsive = Neo.Responsive || {
            responsiveConfig: new Map(),
            apps            : {}
        };

        me.addToResponsiveMap(me.defaultResponsiveConfig, me);
        me.addToResponsiveMap(me.owner.responsiveConfig || {}, me.owner);
        me.handleBodyCls()
    }

    /**
     * @param responsiveObj
     * @param scope
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

            Neo.Responsive.responsiveConfig.set(key, fn)
        }
    }

    /**
     *
     */
    handleBodyCls() {
        const
            me        = this,
            {appName} = me.owner,
            apps      = Neo.Responsive.apps;

        if (!apps[appName]?.activeBodyUpdate) {
            const viewport = Neo.first('viewport'); // todo

            apps[appName] = {
                appId           : viewport.id,
                activeBodyUpdate: true
            };

            viewport.addDomListeners([
                {resize: me.onResizeBody, scope: me}
            ])
        }
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        const
            me           = this,
            config       = {},
            configTester = Neo.Responsive.responsiveConfig,
            {owner}      = me,
            {responsive} = owner;

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

Neo.setupClass(Responsive);

export default Responsive;
