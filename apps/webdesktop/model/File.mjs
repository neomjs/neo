import Model from '../../../src/data/Model.mjs';

const modifiedFormat = new Intl.DateTimeFormat('en-GB', {dateStyle: 'medium', timeZone: 'UTC'});

/**
 * Font Awesome icon per file kind
 * @type {Object}
 */
const kindIcons = {
    doc   : 'fas fa-file-word',
    image : 'fas fa-file-image',
    pdf   : 'fas fa-file-pdf',
    sheet : 'fas fa-file-excel',
    slides: 'fas fa-file-powerpoint',
    text  : 'fas fa-file-lines'
};

/**
 * @summary A shared file: its folder, kind, size and last change. Documents and the Recycle Bin hold the same model,
 * so a file moves between them as its data, and both grids show the same calculated `iconCls`, `modifiedText` and
 * `sizeText`.
 * @class WebDesktop.model.File
 * @extends Neo.data.Model
 */
class File extends Model {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.File'
         * @protected
         */
        className: 'WebDesktop.model.File',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'folder',
            type: 'String'
        }, {
            name     : 'iconCls',
            calculate: data => kindIcons[data.kind] || kindIcons.text
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'kind',
            type: 'String'
        }, {
            name: 'modified',
            type: 'Date'
        }, {
            name     : 'modifiedText',
            calculate: data => modifiedFormat.format(new Date(data.modified))
        }, {
            name: 'name',
            type: 'String'
        }, {
            // Bytes
            name: 'size',
            type: 'Integer'
        }, {
            name     : 'sizeText',
            calculate: ({size}) => size < 1e6 ? `${Math.max(1, Math.round(size / 1e3))} KB` : `${(size / 1e6).toFixed(1)} MB`
        }]
    }
}

export default Neo.setupClass(File);
