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
                    cn : [{
                        cls : 'neo-file-upload-filename'
                    }, {
                        cls : 'neo-file-upload-state'
                    }]
                },
                {
                    cls : 'neo-file-upload-action-icon',
                    tag : 'i'
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
                me.error = `File size exceeds ${me._maxSize}`;
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
        this.state = 'uploading';

        const uploadResponse = await fetch(this.uploadUrl, {
            method  : "POST",
            body    : file,
            headers : this.headers
        });

        // A 200 response means success
        if (Math.floor(uploadResponse.status / 100) === 2) {

        }
        // An HTTP Fail means that we clear, which reverts back to the ready state.
        // But there's an error shown.
        else {
            this.clear();
            this.error = `Upload error: ${uploadResponse.status} ${uploadResponse.statusText}`;
        }
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
}

Neo.applyClassConfig(FileUpload);

export default FileUpload;
