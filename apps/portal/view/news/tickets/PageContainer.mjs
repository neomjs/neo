import PageContainer from '../../shared/content/PageContainer.mjs';

/**
 * @class Portal.view.news.tickets.PageContainer
 * @extends Portal.view.shared.content.PageContainer
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
