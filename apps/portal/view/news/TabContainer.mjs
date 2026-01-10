import TabContainer         from '../shared/TabContainer.mjs';
import TabContainerController from './TabContainerController.mjs';

/**
 * @class Portal.view.news.TabContainer
 * @extends Portal.view.shared.TabContainer
 */
class NewsTabContainer extends TabContainer {
    static config = {
        /**
         * @member {Number|null} activeIndex=null
         */
        activeIndex: null,
        /**
         * @member {String} className='Portal.view.news.TabContainer'
         * @protected
         */
        className: 'Portal.view.news.TabContainer',
        /**
         * @member {String[]} cls=['portal-shared-background', 'portal-news-tab-container']
         */
        cls: ['portal-shared-background', 'portal-news-tab-container'],
        /**
         * @member {Neo.controller.Component} controller=TabContainerController
         */
        controller: TabContainerController,
        /**
         * @member {Object} headerToolbar
         */
        headerToolbar: {
            cls: ['portal-shared-tab-header-toolbar', 'neo-tab-header-toolbar']
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module: () => import('./blog/Container.mjs'),
            header: {
                iconCls: 'fa fa-blog',
                route  : '/news/blog',
                text   : 'Blog'
            }
        }, {
            module: () => import('./tickets/MainContainer.mjs'),
            header: {
                iconCls: 'fa fa-clipboard-list',
                route  : '/news/tickets',
                text   : 'Tickets'
            }
        }, {
            module: () => import('./release/MainContainer.mjs'),
            header: {
                iconCls: 'fa fa-scroll',
                route  : '/news/releases',
                text   : 'Release Notes'
            }
        }]
    }
}

export default Neo.setupClass(NewsTabContainer);
