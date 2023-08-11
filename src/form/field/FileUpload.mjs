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
            {input : me.onInputValueChange, scope: me}
        ]);
    }

    clear() {
        this.vdom.cn[3] = {
            cls   : 'neo-file-upload-input',
            tag   : 'input',
            type  : 'file',
            value : ''
        };
        this.state = 'ready';
        this.error = '';
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange({ files }) {
        const me = this;

        if (files.length) {
            const file = files.item(0);

            if (me.types && !me.types[file.type]) {
                me.error = 'Invalid file type';
            }
            else if (file.size > me.maxSize) {
                me.error = `File size exceeds ${String(me._maxSize).toUpperCase()}`;
            }
            // If it passes the type and maxSize check, upload it
            else {
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

        // Focus the action button
        me.state = 'starting';

        // We hve to wait for the DOM to have changed, and the action button to be visible
        await new Promise(resolve => setTimeout(resolve, 1000));
        me.focus(me.vdom.cn[2].id);

        me.vdom.cn[1].cn[0].innerHTML = file.name;
        me.update();
        me.state = 'uploading';

        fileData.append("file", file);

        // React to upload state changes
        upload.addEventListener('progress', me.onUploadProgress.bind(me));
        upload.addEventListener('error',    me.onUploadError.bind(me));
        xhr.addEventListener('loadend',     me.onUploadDone.bind(me));

        xhr.open("POST", me.uploadUrl, true);

        xhr.send(fileData);
    }

    onUploadProgress({ loaded, total }) {
        const
            progress = loaded / total,
            { vdom } = this;

        (vdom.style || (vdom.style = {}))['--upload-progress'] = `${progress}turn`;

        vdom.cn[1].cn[1].innerHTML = `Uploading... (${Math.round(progress * 100)}%)`;

        this.uploadSize = loaded;
        this.update();
    }

    onUploadError(e) {
        this.clear();
        this.error = e.type;
    }

    onUploadDone({ target : xhr }) {
        const
            me       = this,
            response = JSON.parse(xhr.response);

        if (response.success) {
            me.documentId = response.documentId;
            me.state = 'processing';
            me.vdom.cn[1].cn[1].innerHTML = `Scanning... (${me.formatSize(me.uploadSize)})`;
            me.monitorDocumentState();
        }
        else {
            me.clear();
            me.error = response.message;
        }
    }

    monitorDocumentState() {

    }

    /**
     * Triggered after the state config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {
        const { cls } = this;

        NeoArray.remove(cls, 'neo-file-upload-state-' + oldValue);
        NeoArray.add(cls, 'neo-file-upload-state-' + value);

        this.cls = cls;
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
