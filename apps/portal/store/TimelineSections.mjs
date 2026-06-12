import ContentSections      from './ContentSections.mjs';
import TimelineSection from '../model/TimelineSection.mjs';

/**
 * @class Portal.store.TimelineSections
 * @extends Portal.store.ContentSections
 */
class TimelineSections extends ContentSections {
    static config = {
        /**
         * @member {String} className='Portal.store.TimelineSections'
         * @protected
         */
        className: 'Portal.store.TimelineSections',
        /**
         * @member {Neo.data.Model} model=TimelineSection
         * @reactive
         */
        model: TimelineSection
    }
}

export default Neo.setupClass(TimelineSections);
