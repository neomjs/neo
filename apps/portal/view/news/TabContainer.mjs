import BlogContainer        from '../blog/Container.mjs';
import ReleaseMainContainer from '../release/MainContainer.mjs';
import TabContainer         from '../shared/TabContainer.mjs';

/**
 * @class Portal.view.news.TabContainer
 * @extends Portal.view.shared.TabContainer
 */
class NewsTabContainer extends TabContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.TabContainer'
         * @protected
         */
        className: 'Portal.view.news.TabContainer',
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
            module: BlogContainer,
            header: {
                iconCls: 'fa fa-blog',
                route  : '/news/blog',
                text   : 'Blog'
            }
        }, {
            module: ReleaseMainContainer,
            header: {
                iconCls: 'fa fa-scroll',
                route  : '/news/releases',
                text   : 'Release Notes'
            }
        }]
    }
}

export default Neo.setupClass(NewsTabContainer);
