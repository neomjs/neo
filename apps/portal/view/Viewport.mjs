import BaseViewport       from '../../../src/container/Viewport.mjs';
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
            module: () => import('./home/MainContainer.mjs')
        }],
        /**
         * @member {Object} layout={ntype:'card'}
         */
        layout: {ntype: 'card'}
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const searchString = data?.substr(1) || '';
                const search       = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
                me.deck            = search.deck || 'learnneo';

                me.addCls(me.deck);
            })
    }
}

Neo.applyClassConfig(Viewport);

export default Viewport;
