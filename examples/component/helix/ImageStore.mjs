import ImageModel from './ImageModel.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.component.helix.ImageStore
 * @extends Neo.data.Store
 */
class ImageStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.helix.ImageModel'
         * @protected
         */
        className: 'Neo.examples.component.helix.ImageStore',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=ImageModel
         * @reactive
         */
        model: ImageModel,
        /**
         * @member {String} url=Neo.config.basePath+'resources/examples/data/ai_contacts.json'
         */
        url: Neo.config.basePath + 'resources/examples/data/ai_contacts.json'
    }
}

export default Neo.setupClass(ImageStore);
