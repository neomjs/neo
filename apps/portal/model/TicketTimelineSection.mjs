import ContentSection from './ContentSection.mjs';

/**
 * @class Portal.model.TicketTimelineSection
 * @extends Portal.model.ContentSection
 */
class TicketTimelineSection extends ContentSection {
    static config = {
        /**
         * @member {String} className='Portal.model.TicketTimelineSection'
         * @protected
         */
        className: 'Portal.model.TicketTimelineSection',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'icon',
            type: 'String'
        }, {
            name: 'image',
            type: 'String'
        }, {
            name: 'sourceId',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(TicketTimelineSection);
