import FileStore from '../store/Files.mjs';
import Provider  from '../../../src/state/Provider.mjs';

/**
 * @class Legit.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends Provider {
    static config = {
        /**
         * @member {String} className='Legit.view.ViewportStateProvider'
         * @protected
         */
        className: 'Legit.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {String|null} data.currentFile=null
             */
            currentFile: null
        },
        /**
         * @member {Object} stores
         */
        stores: {
            fileStore: FileStore
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
