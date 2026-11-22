import FileModel from './FileModel.mjs';
import Store     from '../../src/data/Store.mjs';

/**
 * @summary Every folder and file the explorer knows: the project's own entries from the start, and a folder's
 * listing once that folder was opened.
 * @class Neo.examples.fileExplorer.FileStore
 * @extends Neo.data.Store
 */
class FileStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.FileStore'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.FileStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=FileModel
         */
        model: FileModel
    }
}

export default Neo.setupClass(FileStore);
