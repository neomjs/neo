import FileModel from '../model/File.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @class Legit.store.Files
 * @extends Neo.data.Store
 */
class Files extends Store {
    static config = {
        /**
         * @member {String} className='Legit.store.Files'
         * @protected
         */
        className: 'Legit.store.Files',
        /**
         * @member {Neo.data.Model} model=FileModel
         */
        model: FileModel
    }
}

export default Neo.setupClass(Files);
