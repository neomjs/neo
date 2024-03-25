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
        this.addDomListeners([{resize: this.onResize, scope: this}])
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
     *
     */
    async onConstructed() {
        super.onConstructed();

        let me           = this,
            data         = await Neo.Main.getByPath({path: 'location.search'}),
            searchString = data?.substr(1),
            search       = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};

        me.deck = search.deck || 'learnneo';

        me.addCls(me.deck)
    }

    /**
     * @param {Object} data
     */
    onResize(data) {
        this.size = this.getSize(data.borderBoxSize.inlineSize)
    }
}

Neo.setupClass(Viewport);

export default Viewport;
