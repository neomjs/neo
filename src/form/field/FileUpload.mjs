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
         * @member {String} ntype='field-upload-field'
         * @protected
         */
        ntype: 'field-upload-field'
    }
}

Neo.applyClassConfig(FileUpload);

export default FileUpload;
