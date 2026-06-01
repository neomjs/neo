import ContentSection from './ContentSection.mjs';

/**
 * @class Portal.model.TimelineSection
 * @extends Portal.model.ContentSection
 */
class TimelineSection extends ContentSection {
    static config = {
        /**
         * @member {String} className='Portal.model.TimelineSection'
         * @protected
         */
        className: 'Portal.model.TimelineSection',
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
            name: 'iconCls',
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

export default Neo.setupClass(TimelineSection);
