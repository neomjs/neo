import File  from '../model/File.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @summary The shared files of one place, Documents or the Recycle Bin. Both read `resources/data/files.json`; each
 * instance names its list there with `responseRoot`.
 * @class WebDesktop.store.Files
 * @extends Neo.data.Store
 */
class Files extends Store {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Files'
         * @protected
         */
        className: 'WebDesktop.store.Files',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=File
         */
        model: File,
        /**
         * @member {String} url='../../apps/webdesktop/resources/data/files.json'
         */
        url: '../../apps/webdesktop/resources/data/files.json'
    }
}

export default Neo.setupClass(Files);
