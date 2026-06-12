import PageContainer from '../../../../../src/app/content/PageContainer.mjs';

/**
 * @class Portal.view.news.discussions.PageContainer
 * @extends Neo.app.content.PageContainer
 */
class DiscussionPageContainer extends PageContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.discussions.PageContainer'
         * @protected
         */
        className: 'Portal.view.news.discussions.PageContainer',
        /**
         * @member {Object} layout=null
         */
        layout: null,
        /**
         * @member {Object} style={flex:1,overflowY:'auto',position:'relative'}
         */
        style: {flex: 1, overflowY: 'auto', position: 'relative'}
    }
}

export default Neo.setupClass(DiscussionPageContainer);
