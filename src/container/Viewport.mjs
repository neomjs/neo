import Container from './Base.mjs';

/**
 * @class Neo.container.Viewport
 * @extends Neo.container.Base
 */
class Viewport extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.Viewport'
         * @protected
         */
        className: 'Neo.container.Viewport',
        /**
         * @member {String} ntype='viewport'
         * @protected
         */
        ntype: 'viewport',
        /**
         * true applies 'neo-body-viewport' to the document.body
         * @member {Boolean} applyBodyCls=true
         */
        applyBodyCls: true,
        /**
         * Assuming that a Viewport is the top level view of your app, and you want to mount it right away.
         * Could be without any items. Use false otherwise.
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} baseCls=['neo-viewport']
         */
        baseCls: ['neo-viewport'],
        /**
         * true applies a main.addon.ResizeObserver and fires a custom resize event
         * which other instances can subscribe to.
         * @member {Boolean} monitorSize_=false
         * @reactive
         */
        monitorSize_: false
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (value && me.monitorSize) {
            me.addDomListeners([{resize: me.onDomResize, scope: me}])
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        // `oldValue` is what makes a reset publishable. `theme_: null` is a supported state meaning
        // "inherit", and after this method has already published an explicit theme the body cannot be
        // left carrying it — `getTheme()` has moved on and the two surfaces would disagree again, which
        // is the whole defect. A viewport that never had a theme is a different case and stays silent.
        this.isConstructed && (value || oldValue) && this.syncBodyTheme(oldValue)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me         = this,
            {windowId} = me;

        me.applyBodyCls && Neo.main.DomAccess.applyBodyCls({
            cls: ['neo-body-viewport'],
            windowId
        });

        // Only when this viewport carries an explicit theme. An untouched default already agrees with the
        // body, and publishing it here would make that path depend on this method.
        me.theme && me.syncBodyTheme()
    }

    /**
     * @summary Mirrors this viewport's theme onto `document.body`, so both surfaces name one theme.
     *
     * `main.addon.Stylesheet#addGlobalCss` stamps `Neo.config.themes[0]` onto the body once, on the main
     * thread, before any worker runs — and nothing in the theme path rewrites it afterwards. A viewport
     * that already owns `neo-body-viewport` owns this class too; the alternative is a second publisher
     * per app, which is what `apps/shareddialog` had to become as the only `setBodyCls` caller in `src/`.
     *
     * The disagreement this prevents is not cosmetic. `background-color` resolves from the theme class on
     * the viewport while `color` INHERITS from the body's, so a stored light preference against a
     * dark-booted body renders a light background carrying the dark theme's text — measured at 1.13:1
     * contrast, effectively invisible.
     *
     * Every declared theme is removed rather than only `oldValue`: the class the body carries at boot came
     * from `themes[0]` and was never this config's value, so `oldValue` is `undefined` on the first change
     * and cannot name what is actually there.
     *
     * What is published is the EFFECTIVE theme from `getTheme()`, never the `theme` config. The two differ
     * exactly when the config is reset to `null` to return to inheritance: the config says nothing, while
     * `getTheme()` resolves the ancestor's or the window default. Publishing the config there would leave
     * the body on the last explicit theme forever. The callers decide WHETHER to publish; this decides WHAT.
     * @param {String} [oldValue] A previous theme outside the declared set, which `themes` cannot name
     * @protected
     */
    syncBodyTheme(oldValue) {
        let me         = this,
            {windowId} = me;

        if (!me.applyBodyCls) {
            return
        }

        let theme  = me.getTheme(),
            remove = new Set((Neo.windowConfigs?.[windowId] || Neo.config).themes || []);

        oldValue && remove.add(oldValue);
        remove.delete(theme);

        Neo.main.DomAccess.setBodyCls({add: [theme], remove: [...remove], windowId})
    }

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        this.fire('resize', data)
    }
}

export default Neo.setupClass(Viewport);
