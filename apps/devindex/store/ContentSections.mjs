import ContentSectionModel from '../model/ContentSection.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class DevIndex.store.ContentSections
 * @extends Neo.data.Store
 */
class ContentSections extends Store {
    static config = {
        /**
         * @member {String} className='DevIndex.store.ContentSections'
         * @protected
         */
        className: 'DevIndex.store.ContentSections',
        /**
         * @member {Neo.data.Model} model=ContentSectionModel
         * @reactive
         */
        model: ContentSectionModel
    }
}

export default Neo.setupClass(ContentSections);
