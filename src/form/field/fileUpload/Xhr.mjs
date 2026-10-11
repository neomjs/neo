import Transport from './Transport.mjs';

const httpSuccessCodes = {
    2: 1,
    4: 1
};

/**
 * Default HTTP transport for {@link Neo.form.field.FileUpload}.
 *
 * Uploads use `XMLHttpRequest` so byte progress and abort stay observable. Delete and status requests
 * use `fetch`. The hosting field supplies URLs, methods, headers, and the `beforeRequest` event; this
 * class is the only FileUpload layer coupled to those browser request APIs.
 *
 * @class Neo.form.field.fileUpload.Xhr
 * @extends Neo.form.field.fileUpload.Transport
 */
class Xhr extends Transport {
    static config = {
        /**
         * @member {String} className='Neo.form.field.fileUpload.Xhr'
         * @protected
         */
        className: 'Neo.form.field.fileUpload.Xhr'
    }

    /**
     * The active upload request.
     * @member {XMLHttpRequest|null} xhr=null
     * @private
     */
    #xhr = null

    /**
     * Returns a request-local header object after the field's injection hook has run.
     * @returns {Object}
     * @private
     */
    getRequestHeaders() {
        const
            {field} = this,
            headers = {...field.headers};

        field.fire('beforeRequest', {headers});

        return headers
    }

    /**
     * Resolves one document URL against the operation's explicit document id.
     * @param {String|Function|null} urlPattern
     * @param {String|Number} documentId
     * @returns {String|null}
     * @private
     */
    resolveDocumentUrl(urlPattern, documentId) {
        const {field} = this;

        return typeof urlPattern === 'function'
            ? urlPattern.call(field, field)
            : field.createUrl(urlPattern, {
                [field.documentIdParameter]: documentId
            })
    }

    /**
     * Starts an XHR multipart upload.
     * @param {Object} options
     * @param {File|Blob|Object} options.file
     * @param {Function} options.onProgress
     * @returns {Promise<Object|null>}
     */
    upload({file, onProgress}) {
        const
            me       = this,
            {field}  = me,
            xhr      = me.#xhr = new XMLHttpRequest(),
            {upload} = xhr,
            fileData = new FormData(),
            headers  = me.getRequestHeaders();

        fileData.append('file', file);

        return new Promise((resolve, reject) => {
            let settled = false;

            const settle = (callback, value) => {
                if (!settled) {
                    settled = true;
                    callback(value)
                }
            };

            upload.addEventListener('progress', event => onProgress?.(event));
            upload.addEventListener('error', () => settle(reject, new Error('File upload request failed.')));
            upload.addEventListener('abort', () => {
                const error = new Error('File upload request was aborted.');

                error.name = 'AbortError';
                settle(reject, error)
            });

            xhr.addEventListener('loadend', ({loaded}) => {
                if (!settled) {
                    let response = null;

                    if (httpSuccessCodes[String(xhr.status)[0]] && loaded !== 0) {
                        try {
                            response = JSON.parse(xhr.response)
                        } catch (error) {
                            settle(reject, error);
                            return
                        }
                    }

                    settle(resolve, response)
                }
            });

            xhr.open('POST', field.uploadUrl, true);

            for (const header in headers) {
                xhr.setRequestHeader(header, headers[header]);
            }

            xhr.send(fileData)
        }).finally(() => {
            if (me.#xhr === xhr) {
                me.#xhr = null
            }
        })
    }

    /**
     * Aborts the active XHR upload.
     */
    abort() {
        this.#xhr?.abort()
    }

    /**
     * Requests deletion using the field's resolved URL and configured method.
     * @param {String|Number} documentId
     * @returns {Promise<Response>}
     */
    deleteDocument(documentId) {
        const
            {field} = this,
            headers = this.getRequestHeaders(),
            url     = this.resolveDocumentUrl(field._documentDeleteUrl, documentId);

        return fetch(url, {
            method: field.documentDeleteMethod,
            headers
        })
    }

    /**
     * Requests the current processing status using the field's resolved URL.
     * @param {String|Number} documentId
     * @returns {Promise<Response>}
     */
    checkDocumentStatus(documentId) {
        const
            {field} = this,
            headers = this.getRequestHeaders(),
            url     = this.resolveDocumentUrl(field._documentStatusUrl, documentId);

        return fetch(url, {headers})
    }
}

export default Neo.setupClass(Xhr);
