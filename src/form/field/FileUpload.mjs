import Base from '../../form/field/Base.mjs';
import NeoArray from '../../util/Array.mjs';

const
    sizeRE         = /^(\d+)(kb|mb|gb)?$/i,
    sizeMultiplier = {
        unit : 1,
        kb   : 1000,
        mb   : 1000000,
        gb   : 1000000000
    };

/**
 * An accessible file uploading widget which automatically commences an upload as soon as
 * a file is selected using the UI.
 *
 * The URL to which the file must be uploaded is specified in the {@link config#uploadUrl} property.
 * This service must return a JSON status response in the following form for successful uploads:
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
class FileUpload extends Base {
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
         * @member {Object} _vdom
         */
        _vdom: {
            cn : [
                {
                    tag : 'i',
                    cls : 'neo-file-upload-state-icon'
                },
                {
                    cls : 'neo-file-upload-body',
                    cn  : [{
                        cls : 'neo-file-upload-filename'
                    }, {
                        cls : 'neo-file-upload-state'
                    }]
                },
                {
                    cls : 'neo-file-upload-action-button',
                    tag : 'button'
                },
                {
                    cls  : 'neo-file-upload-input',
                    tag  : 'input',
                    type : 'file'
                },
                {
                    cls  : 'neo-file-upload-label',
                    tag  : 'label'
                },
                {
                    cls : 'neo-file-upload-error-message'
                }
            ]
        },

        cls : [],

        /**
         * An Object containing a default set of headers to be passed to the server on every HTTP request.
         * @member {Object} headers
         */
        headers_ : {},

        /**
         * An Object which allows the status text returned from the {@link #property-documentStatusUrl} to be
         * mapped to the corresponding next widget state.
         * @member {Object} documentStatusMap
         */
        documentStatusMap : {
            SCANNING         : 'scanning',

            // The server doing its own secondary upload to the final storage location may return this.
            // We enter the same state as scanning. A spinner shows for the duration of this state
            UPLOADING        : 'scanning',

            MALWARE_DETECTED : 'scan-failed',
            AVAILABLE        : 'not-downloadable',
            DOWNLOADABLE     : 'downloadable',
            DELETED          : 'deleted'
        },

        document_ : null,

        /**
         * If this widget should reference an existing document, configure the widget with a documentId
         * so that it can initialize in the correct "uploaded" state.
         *
         * If this is *not* configured, then this property will be set after a successful upload to
         * the id returned from the {@link #property-uploadUrl}.
         * @member {String|Number} documentId
         */
        documentId : null,

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
         * @member {String} uploadUrl
         */
        uploadUrl : null,

        /**
         * The name of the JSON property in which the document id is returned in the upload response
         * JSON packet and the token string which is substituted for the document id when requesting
         * a malware scan and a document deletion.
         *
         * Defaults fro `documentId`
         *
         * @member {String} downloadUrl
         */
        documentIdParameter : 'documentId',

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
         * @member {String} downloadUrl
         */
        downloadUrl_ : null,

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
         * @member {String} documentStatusUrl
         */
        documentStatusUrl_ : null,

        /**
         * The polling interval *in milliseconds* to wait between asking the server how the document scan
         * is proceeding.
         *
         * Defaults to 2000ms
         *
         * @member {String} documentDeleteUrl
         */
        statusScanInterval : 2000,

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
         * @member {String} documentDeleteUrl
         */
        documentDeleteUrl_ : null,

        /**
         * The HTTP method to use when requesting a document deletion using the {@link #member-documentDeleteUrl}.
         * 
         * Defaults to `DELETE`.
         * @member {String} documentDeleteMethod
         */
        documentDeleteMethod : 'DELETE',

        /**
         * @member {String} state_=null
         */
        state_: 'ready',

        /**
         * @member {Object} types=null
         */
        types_ : null,

        /**
         * @member {String|Number} maxSize
         */
        maxSize_: null,

        /**
         * The error text to show below the widget
         * @member {String} error
         */
        error_ : null,

        // UI strings which can be overridden for other languages
        chooseFile           : 'Choose file',
        documentText         : 'Document',
        invalidFileFormat    : 'invalid file format',
        pleaseUseTheseTypes  : 'Please use these file types',
        fileSizeMoreThan     : 'File size exceeds',
        documentDeleteError  : 'Document delete service error',
        isNoLongerAvailable  : 'is no longer available',
        documentStatusError  : 'Document status service error',
        uploadFailed         : 'Upload failed',
        scanning             : 'Scanning',
        uploading            : 'Uploading...',
        malwareFoundInFile   : 'Malware found in file',
        pleaseCheck          : 'Please check the file and try again',
        successfullyUploaded : 'Successfully uploaded',
        fileWasDeleted       : 'File was deleted'
    }

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

    afterSetId(value, oldValue) {
        const
            labelEl   = this.vdom.cn[4],
            inputElId = `${this.id}-input`;

        this.getInputEl().id =  labelEl.for = inputElId;
        labelEl.html = this.chooseFile;

        // silent vdom update, the super call will trigger the engine
        super.afterSetId?.(value, oldValue);
    }
    
    /**
     * @returns {Object}
     */
    getInputEl() {
        return this.vdom.cn[3];
    }

    async clear() {
        const me = this;

        me.vdom.cn[3] = {
            cls   : 'neo-file-upload-input',
            tag   : 'input',
            type  : 'file',
            value : ''
        };
        me.state = 'ready';
        me.error = '';

        // We have to wait for the DOM to have changed, and the input field to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        me.focus(me.getInputEl().id);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange({ files }) {
        const
            me        = this,
            { types } = me,
            body      = me.vdom.cn[1];

        if (files.length) {
            const
                file     = files.item(0),
                pointPos = file.name.lastIndexOf('.'),
                type     = pointPos > -1 ? file.name.slice(pointPos + 1) : '';

            if (me.types && !types[type]) {
                body.cn[0].innerHTML = file.name;
                body.cn[1].innerHTML = `${me.invalidFileFormat} (.${type}) ${me.formatSize(file.size)}`;
                me.error = `${me.pleaseUseTheseTypes}: .${Object.keys(types).join(' .')}`;
            }
            else if (file.size > me.maxSize) {
                body.cn[0].innerHTML = file.name;
                body.cn[1].innerHTML = me.formatSize(file.size);
                me.error = `${me.fileSizeMoreThan} ${String(me._maxSize).toUpperCase()}`;
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
            me         = this,
            xhr        = me.xhr = new XMLHttpRequest(),
            { upload } = xhr,
            fileData   = new FormData(),
            headers    = { ...me.headers };

        // Show the action button
        me.state = 'starting';

        // We have to wait for the DOM to have changed, and the action button to be visible
        await new Promise(resolve => setTimeout(resolve, 100));
        me.focus(me.vdom.cn[2].id);

        me.vdom.cn[1].cn[0].innerHTML = file.name;
        me.update();
        me.state = 'uploading';

        fileData.append("file", file);

        // React to upload state changes
        upload.addEventListener('progress', me.onUploadProgress.bind(me));
        upload.addEventListener('error',    me.onUploadError.bind(me));
        upload.addEventListener('abort',    me.onUploadAbort.bind(me));
        xhr.addEventListener('loadend',     me.onUploadDone.bind(me));

        xhr.open("POST", me.uploadUrl, true);

        /**
         * This event fires before every HTTP request is sent to the server via any of the configured URLs.
         *
         * @event beforeRequest
         * @param {Object} event The event
         * @param {Object} event.headers An object containing the configured {@link #property-headers}
         * for this widget, into which new headers may be injected.
         * @returns {Object}
         */
        me.fire('beforeRequest', {
            headers
        });
        for (const header in headers) {
            xhr.setRequestHeader(header, headers[header]);
        }

        xhr.send(fileData);
    }

    onUploadProgress({ loaded, total }) {
        const
            progress = this.progress = loaded / total,
            { vdom } = this;

        (vdom.style || (vdom.style = {}))['--upload-progress'] = `${progress}turn`;

        vdom.cn[1].cn[1].innerHTML = `${this.uploading}... (${Math.round(progress * 100)}%)`;

        this.uploadSize = loaded;
        this.update();
    }

    onUploadAbort(e) {
        this.xhr = null;
        this.clear();
    }

    onUploadError(e) {
        this.xhr = null;
        this.state = 'upload-failed';
        this.error = e.type;
    }

    onUploadDone({ loaded, target : xhr }) {
        const me = this;

        me.xhr = null;

        if (loaded !== 0) {
            const response = JSON.parse(xhr.response);

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
                me.clear();
                me.state = 'ready';
                break;

            // For stored documents, we need to tell the server the document
            // is not required.
            case 'processing':
            case 'downloadable':
            case 'not-downloadable':
                me.deleteDocument();
                break;
            case 'deleted':
                me.clear();
                me.state = 'ready';
                break;
        }
    }

    abortUpload() {
        this.xhr?.abort();
    }

    async deleteDocument() {
        const
            me          = this,
            { headers } = me;

        me.fire('beforeRequest', {
            headers
        });

        // We ask the server to delete using our this.documentId
        const statusResponse = await fetch(me.documentDeleteUrl, {
            method : me.documentDeleteMethod,
            headers
        });

        // Success
        if (String(statusResponse.status).slice(0, 1) === '2') {
            me.clear();
            me.state = 'ready';
        }
        else {
            me.error = `${me.documentDeleteError}: ${statusResponse.statusText}`;
        }
    }

    async checkDocumentStatus() {
        const
            me          = this,
            { headers } = me;

        if (me.state === 'processing') {
            me.fire('beforeRequest', {
                headers
            });

            const statusResponse = await fetch(me.documentStatusUrl, {
                headers
            });

            // Success
            if (String(statusResponse.status).slice(0, 1) === '2') {
                const 
                    serverJson   = await statusResponse.json(),
                    serverStatus = serverJson.status,
                    // Map the server's states codes to our own status codes
                    status       = me.documentStatusMap[serverStatus] || serverStatus;

                switch (status) {
                    case 'scanning':
                        setTimeout(() => me.checkDocumentStatus(), me.statusScanInterval);
                        break;
                    case 'deleted':
                        me.error = `${me.documentText} ${me.documentId} ${isNoLongerAvailable}`;
                        me.state = 'ready';
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
                me = this;

            me.preExistingDocument = true;
            me.documentId = document.id;
            me.fileSize = me.formatSize(document.size);
            me.vdom.cn[1].cn[0].innerHTML = document.fileName;
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

        switch (value) {
            case 'ready':
                anchor.tag = 'div';
                anchor.href = '';
                break;
            case 'upload-failed':
                status.innerHTML = `${me.uploadFailed}... (${Math.round(me.progress * 100)}%)`;
                break;
            case 'processing':
                status.innerHTML = `${me.scanning}... (${me.formatSize(me.uploadSize)})`;
                vdom.inert = true;
                break;
            case 'scan-failed':
                status.innerHTML = `${me.malwareFoundInFile}. \u2022 ${me.fileSize}`;
                me.error = me.pleaseCheck;
                break;
            case 'downloadable':
                anchor.tag = 'a';
                anchor.href = me.createUrl(me.downloadUrl, {
                    [me.documentIdParameter] : me.documentId
                });
                status.innerHTML = me.fileSize;
                break;
            case 'not-downloadable':
                status.innerHTML = me.preExistingDocument ?
                me.fileSize : `${me.successfullyUploaded} \u2022 ${me.fileSize}`;
                break;
            case 'deleted':
                status.innerHTML = me.fileWasDeleted;
        }

        me.validate();
        me.update();

        // Processing above may mutate cls
        const { cls } = me;

        NeoArray.remove(cls, 'neo-file-upload-state-' + oldValue);
        NeoArray.add(cls, 'neo-file-upload-state-' + value);
        me.cls = cls;
    }

    /**
     * Creates a URL substituting the passed parameter names in at the places where the name
     * occurs within `{}` in the pattern.
     * @param {String} urlPattern 
     * @param {Object} params 
     */
    createUrl(urlPattern, params) {
        for (const paramName in params) {
            urlPattern = urlPattern.replace(`{${paramName}}`, params[paramName]);
        }
        return urlPattern;
    }

    beforeGetHeaders(headers) {
        return { ...(headers || {}) }
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
        if (text) {
            this.vdom.cn[5].cn = [{
                vtype : 'text',
                html  : text
            }];
        }
        else {
            this.vdom.cn[5].cn = [];
        }

        this.validate();
        this.update();
    }

    formatSize(bytes, separator = '', postFix = '') {
        if (bytes) {
            const
                sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'],
                i     = Math.min(parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10), sizes.length - 1);

            return `${(bytes / (1024 ** i)).toFixed(i ? 1 : 0)}${separator}${sizes[i]}${postFix}`;
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

Neo.applyClassConfig(FileUpload);

export default FileUpload;
