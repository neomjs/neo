import Base from './Base.mjs';

/**
 * Basic support for File System Access API
 *
 * Note: the "File System API" is available in Web Workers.
 * However the "File System Access API" extensions are Not available in Web Workers,
 * because they must handle user gestures and Web Workers do Not have access to the
 * UI, aka main, thread.
 *
 * The extensions return a promises fullfilled by FileSystemHandles,
 * the FileSystemHandles are serializable and make it through (Neo's) Web Worker
 * postMessage signaling to the App worker code, and we are in business,
 *
 * Only supported by Chrome, Edge, Opera; tested with Neo on Chrome, Opera, Edge:
 * https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#browser_support
 *
 * Note:  method parameters (the opts below) are identical to the method paratmeters in
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker etc,
 *
 * @class Neo.main.addon.FileSystemAccessAPI
 * @extends Neo.main.addon.Base
 * @singleton
 */
class FileSystemAccessAPI extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.FileSystemAccessAPI'
         * @protected
         */
        className: 'Neo.main.addon.FileSystemAccessAPI',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'showDirectoryPicker',
                'showOpenFilePicker',
                'showSaveFilePicker',
                'supported'
            ]
        },
    }

    /**
     * Shows a directory picker which allows the user to select a directory.
     * returns a promise fullfilled by a directory handle object.
     * @param {Object} opts (optional)
     */
    showDirectoryPicker(opts) {
       return window.showDirectoryPicker(opts);
    }

    /**
     * Shows a file picker which allows a user to select a file or files.
     * returns a promise fullfilled an array of 1 or more filehandle objects.
     * @param {Object} opts  (optional)
     * https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
     */
    showOpenFilePicker(opts) {
       return window.showOpenFilePicker(opts);
    }

    /**
     * Shows a file picker that allows a user to save a file.
     * returns a promise fullfilled by a filehandle object fullfillment.
     * @param {Object} opts  (optional)
     * https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
     */
    showSaveFilePicker(opts) {
       return window.showSaveFilePicker(opts);
    }

    /**
     * Tests if the browser supports the File System Access API.
     * Returns true if it does, false if it does not.
     **/
    supported() {
        if ('showOpenFilePicker' in self) {
            return true
        } else {
            return false
        }
    }
}

export default Neo.setupClass(FileSystemAccessAPI);
