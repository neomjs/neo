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
         * todo def
         * @member {Map} responsiveConfig: new Map()
         */
        responsiveConfig: new Map(),
        /**
         * todo def
         * @member {Object} defaultResponsiveConfig
         */
        defaultResponsiveConfig: {
            landscape(data) {
                return data.width > data.height;
            },
            portrait(data) {
                return data.width < data.height;
            }
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        console.log('config', config)
        let me = this;

        me.owner.addCls('neo-responsive')

        Neo.first('viewport').addDomListeners([
            {resize: me.onResize, scope: me}
        ])

        Neo.Responsive = Neo.Responsive || {
            responsiveConfig: new Map(),
            apps            : {}
        };

        me.addToResponsiveMap(me.defaultResponsiveConfig, me);
        me.addToResponsiveMap(me.owner.responsiveConfig || {}, me.owner);
        me.handleBodyCls();
    }

    addToResponsiveMap(responsiveObj, scope) {
        for (let [key, value] of Object.entries(responsiveObj)) {
            let fn;

            if (Neo.isObject(value)) {
                fn = function (rect) {
                    let returnBool = true;

                    for (const [subKey, subValue] of Object.entries(value)) {
                        const isMin      = subKey.startsWith('min'),
                              testConfig = subKey.substring(3).toLowerCase();

                        if (isMin) {
                            returnBool = rect[testConfig] > subValue;
                        } else {
                            returnBool = rect[testConfig] < subValue;
                        }

                        if (!returnBool) break;
                    }

                    return returnBool;
                }
            } else {
                fn = value
            }

            fn = fn.bind(scope);

            Neo.Responsive.responsiveConfig.set(key, fn);
        }
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        const me           = this,
              configTester = Neo.Responsive.responsiveConfig,
              owner        = me.owner,
              responsive   = owner.responsive;

        for (const [key, value] of Object.entries(responsive)) {
            const configKeyFn = configTester.get(key),
                  hasKey      = configKeyFn && configKeyFn(data.rect);

            if (hasKey) {
                for (const [configKey, configValue] of Object.entries(value)) {
                    owner[configKey] = configValue;
                }
                owner.update();
            }
        }
    }

    handleBodyCls() {
        const me      = this,
              appName = me.owner.appName,
              apps    = Neo.Responsive.apps;

        if (!apps[appName]?.activeBodyUpdate) {
            const viewport = Neo.first('viewport');

            apps[appName] = {
                appId           : viewport.id,
                activeBodyUpdate: true,
            };

            Neo.first('viewport').addDomListeners([
                {resize: me.onResizeBody, scope: me}
            ]);
        }
    }

    /**
     * Add either neo-landscape or neo-portrait to the parent viewport component
     */
    onResizeBody(data) {
        const viewportName = Neo.Responsive.apps[this.owner.appName].appId;
        console.log('resize')
        if (data.id !== viewportName) return;

        const me          = this,
              newRect     = data.contentRect,
              isLandscape = newRect.width < newRect.height ? false : true,
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
