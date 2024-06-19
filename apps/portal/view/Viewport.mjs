import BaseViewport       from '../../../src/container/Viewport.mjs';
import Container          from '../../../src/container/Base.mjs';
import HeaderToolbar      from './HeaderToolbar.mjs';
import NeoArray           from '../../../src/util/Array.mjs';
import ViewportController from './ViewportController.mjs';
import ViewportModel      from './ViewportModel.mjs';

/**
 * @class Portal.view.Viewport
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
         * @member {String} className='Portal.view.Viewport'
         * @protected
         */
        className: 'Portal.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: HeaderToolbar,
            flex  : 'none'
        }, {
            module   : Container,
            layout   : {ntype: 'card', activeIndex: null},
            reference: 'main-content',

            items: [
                {module: () => import('./home/MainContainer.mjs')},
                {module: () => import('./learn/MainContainer.mjs')},
                {module: () => import('./blog/Container.mjs')},
                {module: () => import('../../../docs/app/view/MainContainer.mjs')}
            ]
        }],
        /**
         * @member {Neo.model.Component} model=ViewportModel
         */
        model: ViewportModel,
        /**
         * @member {Boolean} monitorSize=true
         */
        monitorSize: true,
        /**
         * Values are: large, medium, small, xSmall
         * @member {String|null} size_=null
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

            NeoArray.remove(cls, 'portal-size-' + oldValue);
            NeoArray.add(   cls, 'portal-size-' + value);
            me.cls = cls;

            me.model.setData({size: value})
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
        if (width <=  640) {return 'x-small'}
        if (width <= 1024) {return 'small'}
        if (width <= 1296) {return 'medium'}
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

Neo.setupClass(Viewport);

export default Viewport;
