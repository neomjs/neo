import BaseViewport       from '../../../src/container/Viewport.mjs';
import Container          from '../../../src/container/Base.mjs';
import HeaderToolbar      from './HeaderToolbar.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Portal.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
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
                {module: () => import('./blog/Container.mjs')}
            ]
        }]
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
}

Neo.applyClassConfig(Viewport);

export default Viewport;
