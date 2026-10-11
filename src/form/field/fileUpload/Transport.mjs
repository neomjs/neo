import Base from '../../../core/Base.mjs';

/**
 * Transport contract for {@link Neo.form.field.FileUpload}.
 *
 * A transport owns byte movement and remote document operations. The field remains responsible for
 * file validation, visual state, progress rendering, and mapping remote results onto its state model.
 *
 * @class Neo.form.field.fileUpload.Transport
 * @extends Neo.core.Base
 * @abstract
 */
class Transport extends Base {
    static config = {
        /**
         * @member {String} className='Neo.form.field.fileUpload.Transport'
         * @protected
         */
        className: 'Neo.form.field.fileUpload.Transport',

        /**
         * The FileUpload field currently hosting this transport.
         *
         * A field-created transport is owned and destroyed by that field. A passed-in transport instance
         * remains caller-owned; the field only attaches this reference while it hosts the instance.
         * @member {Neo.form.field.FileUpload|null} field=null
         * @protected
         */
        field: null
    }

    /**
     * Starts one upload.
     *
     * The resolved object is the transport-normalized upload response. It must contain the field's
     * configured document-id property when `success` is true.
     * @param {Object} options
     * @param {File|Blob|Object} options.file
     * @param {Function} options.onProgress Called with `{loaded, total}` while bytes move.
     * @returns {Promise<Object|null>}
     * @abstract
     */
    async upload({file, onProgress}) {
        throw new Error(`${this.className} must implement upload({file, onProgress}).`)
    }

    /**
     * Aborts the active upload, if any.
     * @returns {void}
     */
    abort() {}

    /**
     * Deletes one uploaded document.
     * @param {String|Number} documentId
     * @returns {Promise<Object>}
     * @abstract
     */
    async deleteDocument(documentId) {
        throw new Error(`${this.className} must implement deleteDocument(documentId).`)
    }

    /**
     * Reads the remote processing status for one uploaded document.
     *
     * Transports without a processing phase may leave this unimplemented while the field's
     * `documentStatusUrl` remains unconfigured.
     * @param {String|Number} documentId
     * @returns {Promise<Object>}
     * @abstract
     */
    async checkDocumentStatus(documentId) {
        throw new Error(`${this.className} must implement checkDocumentStatus(documentId).`)
    }

    /**
     * Detaches the hosting field before this transport is destroyed.
     */
    destroy() {
        this.abort();
        this.field = null;

        super.destroy()
    }
}

export default Neo.setupClass(Transport);
