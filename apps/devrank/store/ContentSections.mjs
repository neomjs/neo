import ContentSectionModel from '../model/ContentSection.mjs';
import Store               from '../../../src/data/Store.mjs';

/**
 * @class DevRank.store.ContentSections
 * @extends Neo.data.Store
 */
class ContentSections extends Store {
    static config = {
        /**
         * @member {String} className='DevRank.store.ContentSections'
         * @protected
         */
        className: 'DevRank.store.ContentSections',
        /**
         * @member {Neo.data.Model} model=ContentSectionModel
         * @reactive
         */
        model: ContentSectionModel
    }
}

export default Neo.setupClass(ContentSections);
