import BlogContainer    from '../blog/Container.mjs';
import ReleaseContainer from './ReleaseContainer.mjs';
import TabContainer     from '../../../../src/tab/Container.mjs';

/**
 * @class Portal.view.news.TabContainer
 * @extends Neo.tab.Container
 */
class NewsTabContainer extends TabContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.TabContainer'
         * @protected
         */
        className: 'Portal.view.news.TabContainer',
        /**
         * @member {String[]} cls=['portal-news-tab-container','neo-tab-container']
         * @reactive
         */
        cls: ['portal-news-tab-container', 'neo-tab-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: BlogContainer,
            header: {
                iconCls: 'fa fa-blog',
                text   : 'Blog'
            }
        }, {
            module: ReleaseContainer,
            header: {
                iconCls: 'fa fa-scroll',
                text   : 'Release Notes'
            }
        }],
        /**
         * @member {String} tabBarPosition='left'
         * @reactive
         */
        tabBarPosition: 'left'
    }
}

export default Neo.setupClass(NewsTabContainer);
