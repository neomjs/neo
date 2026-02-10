import PageContainer from '../../../../../src/app/content/PageContainer.mjs';

/**
 * @class Portal.view.news.tickets.PageContainer
 * @extends Neo.app.content.PageContainer
 */
class TicketPageContainer extends PageContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.PageContainer'
         * @protected
         */
        className: 'Portal.view.news.tickets.PageContainer',
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

export default Neo.setupClass(TicketPageContainer);
