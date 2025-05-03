import ContentSectionModel from '../model/ContentSection.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.ContentSections
 * @extends Neo.data.Store
 */
class ContentSections extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.ContentSections'
         * @protected
         */
        className: 'Portal.store.ContentSections',
        /**
         * @member {Neo.data.Model} model=ContentSectionModel
         */
        model: ContentSectionModel
    }
}

export default Neo.setupClass(ContentSections);
