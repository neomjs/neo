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
        baseCls: ['neo-viewport']
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
}

Neo.setupClass(Viewport);

export default Viewport;
