import Base from './Base.mjs';

/**
 * Basic support for File System Access API
 *
 * Note: the "File System API" is available in Web Workers.
 * However, the "File System Access API" extensions are Not available in Web Workers,
 * because they must handle user gestures and Web Workers do Not have access to the
 * UI, aka main, thread.
 *
 * The extensions return a promises fulfilled by FileSystemHandles,
 * the FileSystemHandles are serializable and make it through (Neo's) Web Worker
 * postMessage signaling to the App worker code, and we are in business,
 *
 * Only supported by Chrome, Edge, Opera; tested with Neo on Chrome, Opera, Edge:
 * https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#browser_support
 *
 * Note:  method parameters (the opts below) are identical to the method parameters in
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
 *
 * @class Neo.main.addon.FileSystemAccess
 * @extends Neo.main.addon.Base
 */
class FileSystemAccess extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.FileSystemAccess'
         * @protected
         */
        className: 'Neo.main.addon.FileSystemAccessAPI',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'showDirectoryPicker',
                'showOpenFilePicker',
                'showSaveFilePicker',
                'supported'
            ]
        }
    }

    /**
     * Shows a directory picker which allows the user to select a directory.
     * returns a promise fulfilled by a directory handle object.
     * @param {Object} opts (optional)
     */
    showDirectoryPicker(opts) {
       return window.showDirectoryPicker(opts)
    }

    /**
     * Shows a file picker which allows a user to select a file or files.
     * returns a promise fulfilled an array of 1 or more filehandle objects.
     * @param {Object} opts  (optional)
     * https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
     */
    showOpenFilePicker(opts) {
       return window.showOpenFilePicker(opts)
    }

    /**
     * Shows a file picker that allows a user to save a file.
     * returns a promise fulfilled by a filehandle object fulfillment.
     * @param {Object} opts  (optional)
     * https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
     */
    showSaveFilePicker(opts) {
       return window.showSaveFilePicker(opts)
    }

    /**
     * Tests if the browser supports the File System Access API.
     * Returns true if it does, false if it does not.
     **/
    supported() {
        return 'showOpenFilePicker' in window
    }
}

export default Neo.setupClass(FileSystemAccess);
