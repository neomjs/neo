import ContentSections      from './ContentSections.mjs';
import TicketTimelineSection from '../model/TicketTimelineSection.mjs';

/**
 * @class Portal.store.TicketTimelineSections
 * @extends Portal.store.ContentSections
 */
class TicketTimelineSections extends ContentSections {
    static config = {
        /**
         * @member {String} className='Portal.store.TicketTimelineSections'
         * @protected
         */
        className: 'Portal.store.TicketTimelineSections',
        /**
         * @member {Neo.data.Model} model=TicketTimelineSection
         * @reactive
         */
        model: TicketTimelineSection
    }
}

export default Neo.setupClass(TicketTimelineSections);
