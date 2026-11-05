import Base from './Base.mjs';

/**
 * @summary Saves text that the app worker generated as a file the browser downloads.
 *
 * A worker cannot start a download, because that needs the main thread's DOM. `saveText()` wraps the text in a Blob
 * and clicks an anchor that carries `download`, which works in every browser with no picker and no permission. The
 * app worker loads this addon on demand through `Neo.worker.App#getAddon()`, so an app that never saves a file never
 * loads it.
 *
 * @example
 *     const addon = await Neo.currentWorker.getAddon('FileDownload', windowId);
 *     await addon.saveText({content: 'a,b', fileName: 'rows.csv', mimeType: 'text/csv', windowId});
 *
 * @class Neo.main.addon.FileDownload
 * @extends Neo.main.addon.Base
 */
class FileDownload extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.FileDownload'
         * @protected
         */
        className: 'Neo.main.addon.FileDownload',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'saveText'
            ]
        }
    }

    /**
     * @summary Downloads `content` as a file named `fileName`.
     * @param {Object} data
     * @param {String} data.content
     * @param {String} data.fileName
     * @param {String} [data.mimeType='text/plain']
     * @returns {Boolean} true once the browser has the download
     */
    saveText({content, fileName, mimeType='text/plain'}) {
        const url    = URL.createObjectURL(new Blob([content], {type: mimeType})),
              anchor = document.createElement('a');

        anchor.download      = fileName;
        anchor.href          = url;
        anchor.style.display = 'none';

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        // The click hands the Blob to the download synchronously; revoking on the next task cannot race it
        setTimeout(() => URL.revokeObjectURL(url), 0);

        return true
    }
}

export default Neo.setupClass(FileDownload);
