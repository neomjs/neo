import Container from './Base.mjs';

/**
 * @class Neo.container.Viewport
 * @extends Neo.container.Base
 */
class Viewport extends Container {
    static getConfig() {return {
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
         * @member {String[]} baseCls=['neo-viewport']
         */
        baseCls: ['neo-viewport']
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        this.applyBodyCls && Neo.main.DomAccess.applyBodyCls({
            appName: this.appName,
            cls    : ['neo-body-viewport']
        })
    }
}

export default Neo.applyClassConfig(Viewport);
