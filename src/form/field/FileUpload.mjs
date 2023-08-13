import Base from '../../form/field/Base.mjs';
import NeoArray from '../../util/Array.mjs';

/**
 * @class Neo.form.field.FileUpload
 * @extends Neo.form.field.Base
 */

const
    sizeRE         = /^(\d+)(kb|mb|gb)?$/i,
    sizeMultiplier = {
        unit : 1,
        kb   : 1000,
        mb   : 1000000,
        gb   : 1000000000
    };

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
         * @member {String[]}} baseCls=['neo-file-upload-field']
         * @protected
         */
        baseCls: ['neo-file-upload-field'],
        /**
         * @member {Object}} _vdom
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
                    cls : 'neo-file-upload-error-message'
                }
            ]
        },

        cls : [],

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
        uploadUrl_ : null,

        /**
         * The URL from which the file may be downloaded after it has finished its scan.
         *
         * @member {String} downloadUrl
         */
        downloadUrl_ : null,

        /**
         * The URL of the file status reporting service.
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
        documentStatusUrl : null,

        headers_ : {},

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
        maxSize_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            { input : me.onInputValueChange, scope: me},
            { click : me.onActionButtonClick, delegate : '.neo-file-upload-action-button', scope : me}
        ]);
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
        me.focus(me.vdom.cn[3].id);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange({ files }) {
        const
            me        = this,
            { types } = me;

        if (files.length) {
            const
                file     = files.item(0),
                pointPos = file.name.lastIndexOf('.'),
                type     = pointPos > -1 ? file.name.slice(pointPos + 1) : '';

            if (me.types && !types[type]) {
                me.error = `Please use these file types: .${Object.keys(types).join(' .')}`;
            }
            else if (file.size > me.maxSize) {
                me.error = `File size exceeds ${String(me._maxSize).toUpperCase()}`;
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
            fileData   = new FormData();

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

        xhr.send(fileData);
    }

    onUploadProgress({ loaded, total }) {
        const
            progress = this.progress = loaded / total,
            { vdom } = this;

        (vdom.style || (vdom.style = {}))['--upload-progress'] = `${progress}turn`;

        vdom.cn[1].cn[1].innerHTML = `Uploading... (${Math.round(progress * 100)}%)`;

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
                me.documentId = response.documentId;
                me.state = 'processing';
                me.vdom.cn[1].cn[1].innerHTML = `Scanning... (${me.formatSize(me.uploadSize)})`;
                me.checkDocumentStatus();
            }
            else {
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

            // If the upload or the scan failed, the document will not have been
            // saved, so we just go back to ready state
            case 'upload-failed':
            case 'scan-failed':
                me.clear();
                me.state = 'ready';
                break;

            // During scanning and for stored documents, we need to tell the server the document
            // is not required.
            case 'processing':
            case 'downloadable':
            case 'not-downloadable':
                me.deleteDocument();
                break;
        }
    }

    abortUpload() {
        this.xhr?.abort();
    }

    async deleteDocument() {
        // We ask the server to delete using our this.documentId
        const statusResponse = await fetch(`${this.documentStatusUrl}?delete&documentid=${this.documentId}`);

        // Success
        if (String(statusResponse.status).slice(0, 1) === '2') {
            this.clear();
            this.state = 'ready';
        }
        else {
            this.error = `Document delete service error: ${statusResponse.statusText}`;
        }
    }

    async checkDocumentStatus() {
        const me = this;

        if (this.state === 'processing') {
            const statusResponse = await fetch(`${this.documentStatusUrl}?documentid=${this.documentId}`);

            // Success
            if (String(statusResponse.status).slice(0, 1) === '2') {
                const status = (await statusResponse.json()).status;

                switch (status) {
                    case 'scanning':
                        setTimeout(() => me.checkDocumentStatus(), 2000);
                        break;
                    default:
                        me.state = status;
                }
            }
            else {
                this.error = `Document status service error: ${statusResponse.statusText}`;
            }
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
                cls,
                vdom
            } = me,
            anchor  = vdom.cn[1].cn[0],
            status  = vdom.cn[1].cn[1];

        NeoArray.remove(cls, 'neo-file-upload-state-' + oldValue);
        NeoArray.add(cls, 'neo-file-upload-state-' + value);

        switch (value) {
            case 'ready':
                anchor.id = '';
                anchor.tag = 'div';
                anchor.href = '';
                break;
            case 'upload-failed':
                status.innerHTML = `Upload failed... (${Math.round(me.progress * 100)}%)`;
                break;
            case 'scan-failed':
                status.innerHTML = `Malware found in file. \u2022 ${me.fileSize}`;
                break;
            case 'downloadable':
                anchor.id = '';
                anchor.tag = 'a';
                anchor.href = `${me.downloadUrl}?documentid=${me.documentId}`;
                status.innerHTML = me.fileSize;
                break;
            case 'not-downloadable':
                status.innerHTML = `Successfully uploaded \u2022 ${me.fileSize}`;
        }

        me.update();
        me.cls = cls;
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

    set error(text) {
        const { cls } = this;

        if (text) {
            this.vdom.cn[4].cn = [{
                vtype : 'text',
                html  : text
            }];
            NeoArray.add(cls, 'neo-invalid');
        }
        else {
            NeoArray.remove(cls, 'neo-invalid');
        }

        this.cls = cls;
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
}

Neo.applyClassConfig(FileUpload);

export default FileUpload;
