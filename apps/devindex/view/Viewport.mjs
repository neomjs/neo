import Header                from './HeaderToolbar.mjs';
import BaseViewport          from '../../../src/container/Viewport.mjs';
import NeoArray              from '../../../src/util/Array.mjs';
import ViewportController    from './ViewportController.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class DevIndex.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    /**
     * Valid values for size
     * @member {String[]} sizes=['large','medium','small','x-small',null]
     * @protected
     * @static
     */
    static sizes = ['large', 'medium', 'small', 'x-small', null]

    static config = {
        /**
         * @member {String} className='DevIndex.view.Viewport'
         * @protected
         */
        className: 'DevIndex.view.Viewport',
        /**
         * @member {String[]} cls=['devindex-viewport', 'neo-viewport']
         * @reactive
         */
        cls: ['devindex-viewport', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         * @reactive
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Header,
            flex  : 'none'
        }, {
            ntype    : 'container',
            flex     : 1,
            layout   : {ntype: 'card', activeIndex: null},
            reference: 'main-content',
            items    : [
                {module: () => import('./home/MainContainer.mjs')},
                {module: () => import('./learn/MainContainer.mjs')}
            ]
        }],
        /**
         * @member {Boolean} monitorSize=true
         * @reactive
         */
        monitorSize: true,
        /**
         * Values are: large, medium, small, x-small, null
         * @member {String|null} size_=null
         * @reactive
         */
        size_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.on('resize', me.onResize, me)
    }

    /**
     * Triggered after the size config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        if (value) {
            let me  = this,
                cls = me.cls;

            NeoArray.remove(cls, 'devindex-size-' + oldValue);
            NeoArray.add(   cls, 'devindex-size-' + value);
            me.cls = cls;

            me.stateProvider.setData({size: value})
        }
    }

    /**
     * Triggered before the size config gets changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @returns {String|null}
     * @protected
     */
    beforeSetSize(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'size')
    }

    /**
     * @param {Number} width
     * @returns {String}
     */
    getSize(width) {
        if (width <=  640) return 'x-small';
        if (width <= 1024) return 'small';
        if (width <= 1296) return 'medium';
        return 'large'
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        let me = this;

        if (me.id === data.id) {
            me.size = me.getSize(data.borderBoxSize.inlineSize)
        }
    }
}

export default Neo.setupClass(Viewport);
