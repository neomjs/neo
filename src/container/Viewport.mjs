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
     *
     */
    onConstructed() {
        super.onConstructed();

        let {appName, windowId} = this;

        this.applyBodyCls && Neo.main.DomAccess.applyBodyCls({
            appName,
            cls: ['neo-body-viewport'],
            windowId
        })
    }

    /**
     * @param {Object} data
     */
    onDomResize(data) {
        this.fire('resize', data)
    }
}

Neo.setupClass(Viewport);

export default Viewport;
