import Field           from './Base.mjs';
import Transport       from './fileUpload/Transport.mjs';
import XhrTransport    from './fileUpload/Xhr.mjs';
import NeoArray        from '../../util/Array.mjs';
import ClassSystemUtil from '../../util/ClassSystem.mjs';

const
    sizeRE         = /^(\d+)(kb|mb|gb)?$/i,
    sizeMultiplier = {
        unit: 1,
        kb  : 1000,
        mb  : 1000000,
        gb  : 1000000000
    },
    httpSuccessCodes = {
        2 : 1,
        4 : 1
    };

/**
 * An accessible file uploading widget which automatically commences an upload as soon as
 * a file is selected using the UI.
 *
 * Byte movement is delegated to {@link config#uploadTransport}. The default
 * {@link Neo.form.field.fileUpload.Xhr} transport uses the URL specified in
 * {@link config#uploadUrl} and expects a JSON response in the following form for successful uploads:
 *
 * ```json
 * {
 *     "success" : true,
 *     "documentId" : 1
 * }
 * ```
 *
 * And the following form for unsuccessful uploads:
 *
 * ```json
 * {
 *     "success" : false,
 *     "message" : "Why the upload was rejected"
 * }
 * ```
 *
 * The name of the `documentId` property is configured in {@link #member-documentIdParameter}.
 * It defaults to `'documentId'`.
 *
 * The `documentId` is used when requesting the document malware scan status, and when requesting
 * that the document be deleted, or downloaded.
 *
 * If the upload is successful, then the {@link #member-documentStatusUrl} is polled until the
 * malware scan. The document id returned from the upload is passed in the parameter named
 * by the {@link #member-documentIdParameter}. It defaults to `'documentId'`.
 *
 * This service must return a JSON status response in the following if the scan is still progressing:
 *
 * ```json
 * {
 *     "status" : "scanning"
 * }
 * ```
 *
 * And the following form is malware was detected:
 *
 * ```json
 * {
 *     "status" : "scan-failed"
 * }
 * ```
 *
 * After a successful scan, a document may or may not be downloadable.
 *
 * For a downloadable document, the response must be:
 *
 * ```json
 * {
 *     "status" : "downloadable"
 * }
 * ```
 *
 * For a non-downloadable document, the response must be:
 *
 * ```json
 * {
 *     "status" : "not-downloadable"
 * }
 * ```
 * @class Neo.form.field.FileUpload
 * @extends Neo.form.field.Base
 */
class FileUpload extends Field {
    /**
     * Whether the current upload transport was created from this field's class/config value.
     * Passed-in instances remain externally owned.
     * @member {Boolean} #ownsUploadTransport=false
     * @private
     */
    #ownsUploadTransport = false

    static config = {
        /**
         * @member {String} className='Neo.form.field.FileUpload'
         * @protected
         */
        className: 'Neo.form.field.FileUpload',
        /**
         * @member {String} ntype='file-upload-field'
         * @protected
         */
        ntype: 'file-upload-field',
        /**
         * @member {String[]} baseCls=['neo-file-upload-field']
         * @protected
         */
        baseCls: ['neo-file-upload-field'],
        /**
         * @member {String[]} cls=['neo-field-empty']
         * @reactive
         */
        cls: ['neo-field-empty'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'i', cls: 'neo-file-upload-state-icon'},
            {cls: 'neo-file-upload-body', cn: [
                {cls: 'neo-file-upload-filename'},
                {cls: 'neo-file-upload-state'}
            ]},
            {tag: 'button', cls: 'neo-file-upload-action-button'},
            {tag: 'input', cls: 'neo-file-upload-input', type: 'file'},
            {tag: 'label', cls: 'neo-file-upload-label'},
            {cls: 'neo-file-upload-error-message'}
        ]},

        /**
         * An Object containing a default set of headers to be passed to the server on every HTTP request.
         * @member {Object} headers
         */
        headers_: {},

        /**
         * An Object which allows the status text returned from the {@link #property-documentStatusUrl} to be
         * mapped to the corresponding next widget state.
         * @member {Object} documentStatusMap
         */
        documentStatusMap: {
            SCANNING         : 'scanning',

            // The server doing its own secondary upload to the final storage location may return this.
            // We enter the same state as scanning. A spinner shows for the duration of this state
            UPLOADING       : 'scanning',

            MALWARE_DETECTED: 'scan-failed',
            UN_DOWNLOADABLE : 'not-downloadable',
            AVAILABLE       : 'not-downloadable',
            DOWNLOADABLE    : 'downloadable',
            DELETED         : 'deleted',
            ERROR           : 'error'
        },

        /**
         * @member {String|null} document_=null
         * @reactive
         */
        document_: null,

        /**
         * If this widget should reference an existing document, configure the widget with a documentId
         * so that it can initialize in the correct "uploaded" state.
         *
         * If this is *not* configured, then this property will be set after a successful upload to
         * the id returned from the {@link #property-uploadUrl}.
         * @member {String|Number} documentId
         */
        documentId: null,

        /**
         * The URL of the file upload service to which the selected file is sent.
         *
         * This service must return a JSON response of the form:
         *
         * ```json
         * {
         *     "success"    : true,
         *     "message"    : "Only needed if the success property is false",
         *     "documentId" : 1
         * }
         * ```
         *
         * The document id is needed so that this widget can follow up and request the results of the
         * scan operation to see if the file was accepted, and whether it is to be subsequently downloadable.
         *
         * The document status request URL must be configured in {@link #member-documentStatusUrl}
         * @member {String|null} uploadUrl=null
         */
        uploadUrl: null,

        /**
         * Transport class, config, or instance responsible for upload, abort, delete, and status
         * request mechanics.
         *
         * Class/config values are instantiated, hosted, and destroyed by this field. A passed-in
         * {@link Neo.form.field.fileUpload.Transport} instance remains caller-owned and is detached
         * when replaced or when the field is destroyed.
         * @member {Neo.form.field.fileUpload.Transport|Object|Function} uploadTransport_=Neo.form.field.fileUpload.Xhr
         * @reactive
         */
        uploadTransport_: XhrTransport,

        /**
         * The name of the JSON property in which the document id is returned in the upload response
         * JSON packet and the token string which is substituted for the document id when requesting
         * a malware scan and a document deletion.
         *
         * Defaults fro `documentId`
         *
         * @member {String} documentIdParameter='documentId'
         */
        documentIdParameter: 'documentId',

        /**
         * The URL from which the file may be downloaded after it has finished its scan.
         *
         * This must contain a substitution token named the same as the {@link #property-documentIdParameter}
         * which is used when creating a URL
         *
         * for example:
         *
         * ```json
         * {
         *     downloadUrl : '/getDocument/${documentId}'
         * }
         * ```
         *
         * The document id returned from the {@link #member-uploadUrl upload} is passed in the parameter named
         * by the {@link #member-documentIdParameter}. It defaults to `'documentId'`.
         *
         * @member {String|null} downloadUrl_=null
         * @reactive
         */
        downloadUrl_: null,

        /**
         * The URL of the file status reporting service.
         *
         * This must contain a substitution token named the same as the {@link #property-documentIdParameter}
         * which is used when creating a URL
         *
         * for example:
         *
         * ```json
         * {
         *     documentStatusUrl : '/getDocumentStatus/${documentId}'
         * }
         * ```
         *
         * This widget will use this service after a successful upload to determine its next
         * state.
         *
         * This service must return a JSON response of the form:
         *
         * ```json
         * {
         *     "status" : "scanning" or "scan-failed" or "downloadable or "not-downloadable"
         * }
         * ```
         *
         * @member {String|null} documentStatusUrl_=null
         * @reactive
         */
        documentStatusUrl_: null,

        /**
         * The polling interval *in milliseconds* to wait between asking the server how the document scan
         * is proceeding.
         *
         * Defaults to 2000ms
         *
         * @member {Number} statusScanInterval=2000
         */
        statusScanInterval: 2000,

        /**
         * The URL of the file deletion service.
         *
         * This must contain a substitution token named the same as the {@link #property-documentIdParameter}
         * which is used when creating a URL
         *
         * for example:
         *
         * ```json
         * {
         *     documentDeleteUrl : '/deleteDocument/${documentId}'
         * }
         * ```
         *
         * This widget will use this service after a successful upload to determine its next
         * state.
         *
         * If this service yields an HTTP 200 status, the deletion is taken to have been successful.
         *
         * @member {String|null} documentDeleteUrl_=null
         * @reactive
         */
        documentDeleteUrl_: null,

        /**
         * The HTTP method to use when requesting a document deletion using the {@link #member-documentDeleteUrl}.
         *
         * Defaults to `DELETE`.
         * @member {String} documentDeleteMethod='DELETE'
         */
        documentDeleteMethod: 'DELETE',

        /**
         * @member {String} state_=ready
         * @reactive
         */
        state_: 'ready',

        /**
         * @member {Object} types=null
         */
        types_: null,

        /**
         * @member {String|Number|null} maxSize=null
         */
        maxSize_: null,

        /**
         * The error text to show below the widget
         * @member {String|null} error_=null
         * @reactive
         */
        error_ : null,

        // UI strings which can be overridden for other languages
        chooseFile          : 'Choose file',
        documentText        : 'Document',
        invalidFileFormat   : 'invalid file format',
        pleaseUseTheseTypes : 'Please use these file types {allowedFileTypes}',
        fileSizeMoreThan    : 'File size exceeds {allowedFileSize}',
        uploadError         : 'Please try again',
        documentDeleteError : 'Document delete service error',
        isNoLongerAvailable : 'is no longer available',
        documentStatusError : 'Document status service error',
        uploadFailed        : 'Upload failed',
        scanning            : 'Scanning',
        uploading           : 'Uploading...',
        malwareFoundInFile  : 'Malware found in file',
        pleaseCheck         : 'Please check the file and try again',
        successfullyUploaded: 'Successfully uploaded',
        fileWasDeleted      : 'File was deleted',
        fileIsInAnErrorState: 'File is in an error state'
    }

    /**
     * Fires before the default HTTP transport sends any configured request. Listeners may add or
     * replace entries on the request-local headers object.
     * @event beforeRequest
     * @param {Object} event
     * @param {Object} event.headers A copy of {@link #property-headers} for this request.
     */

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.addDomListeners([
            { input : me.onInputValueChange, scope: me},
            { click : me.onActionButtonClick, delegate : '.neo-file-upload-action-button', scope : me}
        ]);
    }

    /**
     * @protected
     */
    ensureStableIds() {
        super.ensureStableIds();

        const inputElId = `${this.id}-input`;

        this.getInputEl().id = this.vdom.cn[4].for = inputElId
    }

    onConstructed() {
        super.onConstructed(...arguments);

        this.vdom.cn[4].text = this.chooseFile;
    }

    /**
     * @returns {Object}
     */
    getInputEl() {
        return this.vdom.cn[3];
    }

    async clear() {
        const
            me      = this,
            { cls } = me;

        NeoArray.add(cls, 'neo-field-empty');
        me.cls = cls;

        me.vdom.cn[3] = {
            id   : `${me.id}-input`,
            cls  : 'neo-file-upload-input',
            tag  : 'input',
            type : 'file',
            value: ''
        };
        me.state = 'ready';
        me.error = '';
        me.file = me.document = null;

        // We have to wait for the DOM to have changed, and the input field to be visible
        await me.timeout(100);
        me.focus(me.getInputEl().id);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange({ files }) {
        const
            me           = this,
            {cls, types} = me,
            body         = me.vdom.cn[1];

        if (files.length) {
            NeoArray.remove(cls, 'neo-field-empty');
            me.cls = cls;

            const
                file     = files.item(0),
                pointPos = file.name.lastIndexOf('.'),
                type     = pointPos > -1 ? file.name.slice(pointPos + 1) : '';

            if (me.types && !types[type]) {
                body.cn[0].text = file.name;
                body.cn[1].text = `${me.invalidFileFormat} (.${type}) ${me.formatSize(file.size)}`;
                me.error = me.pleaseUseTheseTypes?.replace('{allowedFileTypes}', Object.keys(types).join(' .'))
            }
            else if (file.size > me.maxSize) {
                body.cn[0].text = file.name;
                body.cn[1].text = me.formatSize(file.size);
                me.error = me.fileSizeMoreThan?.replace('{allowedFileSize}', String(me._maxSize).toUpperCase());
            }
            // If it passes the type and maxSize check, upload it
            else {
                me.fileSize = me.formatSize(file.size);
                me.error = '';
                me.upload(file);
            }
        }
        // If cleared, we go back to ready state
        else {
            me.state = 'ready';
        }
    }

    async upload(file) {
        const
            me = this;

        // Show the action button
        me.file  = file;
        me.state = 'starting';

        // We have to wait for the DOM to have changed, and the action button to be visible
        await me.timeout(100);
        me.focus(me.vdom.cn[2].id);

        me.vdom.cn[1].cn[0].text = file.name;
        me.update();
        me.state = 'uploading';

        // This means no progress as opposed to zero, but still during a currently successful ongoing upload.
        // When it is NaN, the error display does not attempt to show progress.
        me.progress = NaN;

        let response;

        try {
            response = await me.uploadTransport.upload({
                file,
                onProgress: event => me.onUploadProgress(event)
            })
        } catch (error) {
            if (error.name === 'AbortError') {
                me.onUploadAbort(error)
            } else {
                me.onUploadError(error)
            }

            return
        }

        me.onUploadDone(response)
    }

    /**
     * @param {Boolean} [updateParentVdom=true]
     * @param {Boolean} [silent=false]
     */
    destroy(updateParentVdom, silent) {
        const me = this;

        me.releaseUploadTransport(me.uploadTransport);

        super.destroy(updateParentVdom, silent)
    }

    onUploadProgress({ loaded, total }) {
        if (this.isDestroyed) {
            return
        }

        const
            progress = this.progress = loaded / total,
            { vdom } = this;

        (vdom.style || (vdom.style = {}))['--upload-progress'] = `${progress}turn`;

        vdom.cn[1].cn[1].text = `${this.uploading}... (${Math.round(progress * 100)}%)`;

        this.uploadSize = loaded;
        this.update()
    }

    onUploadAbort(e) {
        if (this.isDestroyed) {
            return
        }

        this.clear()
    }

    onUploadError(e) {
        if (this.isDestroyed) {
            return
        }

        this.state = 'upload-failed';
        this.error = `${this.uploadError}`
    }

    /**
     * Maps a transport-normalized upload response onto the field state.
     * @param {Object|null} response
     */
    onUploadDone(response) {
        if (this.isDestroyed) {
            return
        }

        const me = this;

        if (response) {
            if (response.success) {
                me.documentId = response[me.documentIdParameter];

                // The status check phase is optional.
                // If no URL specified, the file is taken to be downloadable.
                if (me.documentStatusUrl) {
                    me.state = 'processing';

                    // Start polling the server to see when the scan has a result;
                    me.checkDocumentStatus();
                }
                else {
                    me.state = 'downloadable';
                }
            }
            else {
                me.error = response.message;
                me.state = 'upload-failed';
            }
        }
    }

    onActionButtonClick() {
        const
            me        = this,
            { state } = me;

        // When they click the action button, depending on which state we are in, we go to
        // different states.
        switch (state) {
            // During upload, its an abort
            case 'uploading':
                me.abortUpload();
                break;

            // While processing we just have to wait until it's succeeded or failed..
            case 'processing':
                break;

            // If the upload or the scan failed, the document will not have been
            // saved, so we just go back to ready state
            case 'upload-failed':
            case 'scan-failed':
            case 'error':
                me.clear();
                me.state = 'ready';
                break;

            // For stored documents, we need to tell the server the document
            // is not required.
            case 'downloadable':
            case 'not-downloadable':
                me.deleteDocument();
                break;
            case 'deleted':
                me.clear();
                me.state = 'ready';
                break;
            case 'ready':
                me.clear();
                break;
        }
    }

    abortUpload() {
        this.uploadTransport?.abort();
    }

    async deleteDocument() {
        const me = this;

        // We ask the server to delete using our this.documentId
        const statusResponse = await me.trap(me.uploadTransport.deleteDocument(me.documentId));

        // Success
        if (httpSuccessCodes[String(statusResponse.status)[0]]) {
            me.clear();
            me.state = 'ready';
        }
        else {
            me.error = `${me.documentDeleteError}: ${statusResponse.statusText}`;
        }
    }

    async checkDocumentStatus() {
        const me = this;

        if (me.state === 'processing') {
            const statusResponse = await me.trap(me.uploadTransport.checkDocumentStatus(me.documentId));

            // Success
            if (httpSuccessCodes[String(statusResponse.status)[0]]) {
                const
                    serverJson   = await statusResponse.json(),
                    serverStatus = serverJson.status,
                    // Map the server's states codes to our own status codes
                    status       = me.documentStatusMap[serverStatus] || serverStatus;

                switch (status) {
                    case 'scanning':
                        me.timeout(me.statusScanInterval).then(() => {me.checkDocumentStatus()});
                        break;
                    case 'deleted':
                        me.error = `${me.documentText} ${me.documentId} ${isNoLongerAvailable}`;
                        me.state = 'ready';
                        break;
                    case 'error':
                        me.error = `${me.documentStatusError}: ${statusResponse.statusText || `Server error ${statusResponse.status}`}`;
                        me.state = 'deleted';
                        break;
                    default:
                        me.state = status;
                }
            }
            else {
                me.error = `${me.documentStatusError}: ${statusResponse.statusText || `Server error ${statusResponse.status}`}`;
                me.state = 'deleted';
            }
        }
    }

    afterSetDocument(document) {
        if (document) {
            const
                me    = this,
                {cls} = me;

            NeoArray.remove(cls, 'neo-field-empty');
            me.cls = cls;

            me.documentId = document.id;
            me.fileSize = me.formatSize(document.size);
            me.vdom.cn[1].cn[0].text = document.fileName;
            me.state = me.documentStatusMap[document.status];
        }
    }

    /**
     * Triggered after the state config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {
        const
            me      = this,
            {
                vdom
            } = me,
            anchor  = vdom.cn[1].cn[0],
            status  = vdom.cn[1].cn[1];

        delete vdom.inert;

        let isChangeEventNeeded;

        switch (value) {
            case 'ready':
                anchor.tag = 'div';
                anchor.href = '';
                isChangeEventNeeded = true;
                break;
            case 'upload-failed':
                status.text = `${me.uploadFailed}${isNaN(me.progress) ? '' : `... (${Math.round(me.progress * 100)}%)`}`;
                isChangeEventNeeded = true;
                break;
            case 'processing':
                status.text = `${me.scanning}... (${me.formatSize(me.uploadSize)})`;
                vdom.inert = true;
                break;
            case 'scan-failed':
                status.text = `${me.malwareFoundInFile}. \u2022 ${me.fileSize}`;
                me.error = me.pleaseCheck;
                isChangeEventNeeded = true;
                break;
            case 'downloadable':
                anchor.tag = 'a';
                anchor.href = me.createUrl(me.downloadUrl, {
                    [me.documentIdParameter] : me.documentId
                });
                status.text = me.fileSize;
                isChangeEventNeeded = true;
                break;
            case 'not-downloadable':
                status.text = me.document ? me.fileSize : `${me.successfullyUploaded} \u2022 ${me.fileSize}`;
                isChangeEventNeeded = true;
                break;
            case 'deleted':
                status.text = me.fileWasDeleted;
                isChangeEventNeeded = true;
                break;
            case 'error':
                status.text = me.fileIsInAnErrorState;
                me.error = me.pleaseCheck;
                isChangeEventNeeded = true;
            }

        if (isChangeEventNeeded && oldValue !== undefined) {
            me.fireChangeEvent(me.file)
        }
        me.validate();
        me.update();

        // Processing above may mutate cls
        const { cls } = me;

        NeoArray.remove(cls, 'neo-file-upload-state-' + oldValue);
        NeoArray.add(cls, 'neo-file-upload-state-' + value);
        NeoArray[me.file || me.document ? 'remove' : 'add', 'neo-field-empty'];
        me.cls = cls;
    }

    /**
     * @summary Creates a URL by substituting non-nullish parameter values into matching tokens.
     *
     * A null or absent pattern passes through unchanged, so documented-optional URL configs
     * (status / delete / download) stay inert instead of crashing on `replace`. A nullish value
     * is rejected only when its token is present; token-free URL configs remain valid.
     * @param {String|null|undefined} urlPattern
     * @param {Object} params
     * @returns {String|null|undefined}
     * @throws {TypeError} When a present pattern token has a nullish parameter value.
     */
    createUrl(urlPattern, params) {
        if (urlPattern == null) {
            return urlPattern
        }

        for (const paramName in params) {
            const
                token      = `{${paramName}}`,
                paramValue = params[paramName];

            if (urlPattern.includes(token)) {
                if (paramValue == null) {
                    throw new TypeError(`Cannot substitute nullish URL parameter: ${paramName}`)
                }

                urlPattern = urlPattern.replace(token, paramValue)
            }
        }

        return urlPattern;
    }

    beforeGetHeaders(headers) {
        return { ...(headers || {}) }
    }

    /**
     * Normalizes a transport class/config/instance and reconciles ownership on replacement.
     * @param {Neo.form.field.fileUpload.Transport|Object|Function|null} value
     * @param {Neo.form.field.fileUpload.Transport|null} oldValue
     * @returns {Neo.form.field.fileUpload.Transport}
     * @protected
     */
    beforeSetUploadTransport(value, oldValue) {
        const me = this;

        if (value === oldValue) {
            return value
        }

        const
            isExternalInstance = Neo.typeOf(value) === 'NeoInstance',
            transport          = ClassSystemUtil.beforeSetInstance(value, XhrTransport, {
                field: me
            });

        if (!(transport instanceof Transport)) {
            !isExternalInstance && transport?.destroy?.();

            throw new TypeError('FileUpload uploadTransport must extend Neo.form.field.fileUpload.Transport.')
        }

        if (isExternalInstance && transport.field && transport.field !== me) {
            throw new Error('FileUpload uploadTransport instance is already attached to another field.')
        }

        oldValue && me.releaseUploadTransport(oldValue);

        transport.field = me;
        me.#ownsUploadTransport = !isExternalInstance;

        return transport
    }

    /**
     * Releases one hosted transport according to its ownership provenance.
     * @param {Neo.form.field.fileUpload.Transport|null} transport
     * @private
     */
    releaseUploadTransport(transport) {
        if (!transport) {
            return
        }

        if (this.#ownsUploadTransport) {
            transport.destroy()
        } else {
            transport.abort();

            if (transport.field === this) {
                transport.field = null
            }
        }

        this.#ownsUploadTransport = false
    }

    beforeGetDocumentStatusUrl(documentStatusUrl) {
        const me = this;

        return typeof documentStatusUrl === 'function'? documentStatusUrl.call(me, me) : me.createUrl(documentStatusUrl, {
            [me.documentIdParameter] : me.documentId
        });
    }

    beforeGetDocumentDeleteUrl(documentDeleteUrl) {
        const me = this;

        return typeof documentDeleteUrl === 'function'? documentDeleteUrl.call(me, me) : me.createUrl(documentDeleteUrl, {
            [me.documentIdParameter] : me.documentId
        });
    }

    beforeGetDownloadUrl(downloadUrl) {
        const me = this;

        return typeof downloadUrl === 'function'? downloadUrl.call(me, me) : me.createUrl(downloadUrl, {
            [me.documentIdParameter] : me.documentId
        });
    }

    beforeGetMaxSize(maxSize) {
        // Not configured means no limit
        if (maxSize == null) {
            return Number.MAX_SAFE_INTEGER;
        }

        // Split eg "100mb" into the numeric and units parts
        const sizeParts = sizeRE.exec(maxSize);

        if (sizeParts) {
            // Convert mb to 1000000 etc
            const multiplier = sizeMultiplier[(sizeParts[2]||'unit').toLowerCase()];

            return parseInt(sizeParts[1]) * multiplier;
        }
    }

    afterSetError(text) {
        this.vdom.cn[5].cn = text ? [{vtype : 'text', text}] : [];
        this.validate();
        this.update();
    }

    formatSize(bytes, separator = '', postFix = '') {
        if (bytes) {
            const
                sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'],
                i     = Math.min(parseInt(Math.floor(Math.log(bytes) / Math.log(1000)).toString(), 10), sizes.length - 1);

            return `${(bytes / (1000 ** i)).toFixed(i ? 1 : 0)}${separator}${sizes[i]}${postFix}`;
        }
        return 'n/a';
    }

    /**
     * @returns {Boolean}
     */
    validate() {
        const
            { cls } = this,
            isValid = this.isValid();

        NeoArray.toggle(cls, 'neo-invalid', !isValid);
        this.cls = cls;

        return isValid;
    }

    isValid() {
        const me = this;

        return !me.error &&  !(me.state === 'ready' && me.required) ||
               (    (me.state === 'downloadable') ||
                    (me.state === 'not-downloadable')
               );
    }
}

export default Neo.setupClass(FileUpload);
