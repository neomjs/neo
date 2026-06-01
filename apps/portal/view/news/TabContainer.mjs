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
         * NOTE: the tab bar is docked left (`tabBarPosition: 'left'`), so its header toolbar lays out
         * with `column-reverse` (see `src/tab/header/Toolbar.mjs` `getLayoutConfig`) — the LAST entry in
         * this list renders as the TOP (first) tab. Items are therefore listed in REVERSE of the intended
         * top-to-bottom display order, which is:
         *   Release Notes, Tickets, Discussions, Blog, Medium, Pull Requests.
         * Append a new tab to the END of this array to make it the first/top tab.
         * @member {Object[]} items
         */
        items: [{
            module: () => import('./pulls/MainContainer.mjs'),
            header: {
                iconCls: 'fa fa-code-pull-request',
                route  : '/news/pulls',
                text   : 'Pull Requests'
            }
        }, {
            module: () => import('./medium/Container.mjs'),
            header: {
                iconCls: 'fab fa-medium',
                route  : '/news/medium',
                text   : 'Medium'
            }
        }, {
            module: () => import('./blog/MainContainer.mjs'),
            header: {
                iconCls: 'neo-logo-blue',
                route  : '/news/blog',
                text   : 'Blog'
            }
        }, {
            module: () => import('./discussions/MainContainer.mjs'),
            header: {
                iconCls: 'fa fa-comments',
                route  : '/news/discussions',
                text   : 'Discussions'
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
        }],
        /**
         * @member {Object} unmountConfigs={activeIndex: null}
         */
        unmountConfigs: {
            activeIndex: null
        }
    }
}

export default Neo.setupClass(NewsTabContainer);
