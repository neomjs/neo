import ImageModel from './ImageModel.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.component.gallery.ImageStore
 * @extends Neo.data.Store
 */
class ImageStore extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.gallery.ImageModel'
         * @protected
         */
        className: 'Neo.examples.component.gallery.ImageStore',
        /**
         * @member {Neo.data.Model} model=ImageModel
         */
        model: ImageModel
    }}
}

Neo.applyClassConfig(ImageStore);

export default ImageStore;
