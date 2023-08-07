import Base from '../../form/field/Base.mjs';

/**
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
         * @member {String[]}} baseCls=['neo-file-upload-field']
         * @protected
         */
        baseCls: ['neo-file-upload-field']
    }
}

Neo.applyClassConfig(FileUpload);

export default FileUpload;
