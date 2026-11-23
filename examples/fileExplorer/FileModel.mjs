import Model from '../../src/data/Model.mjs';

/**
 * @summary One entry of the file explorer: a folder or a file, linked to its folder by `parentId`, the shape
 * `Neo.tree.List` renders. A file's icon follows its name, so a rename to another extension changes it.
 * A folder with a `listing` holds no children until it is first opened: the tree loads them from that URL and sets
 * `loaded`.
 * @class Neo.examples.fileExplorer.FileModel
 * @extends Neo.data.Model
 */
class FileModel extends Model {
    /**
     * File kinds by extension: the label the detail pane shows, and the icon class the tree draws
     * @member {Object<String, {icon: String, label: String}>} kinds
     * @static
     */
    static kinds = {
        css : {icon: 'fe-kind-css',    label: 'Stylesheet'},
        gif : {icon: 'fe-kind-image',  label: 'Image'},
        html: {icon: 'fe-kind-html',   label: 'HTML page'},
        jpg : {icon: 'fe-kind-image',  label: 'Image'},
        js  : {icon: 'fe-kind-script', label: 'JavaScript'},
        json: {icon: 'fe-kind-data',   label: 'JSON data'},
        log : {icon: 'fe-kind-log',    label: 'Log file'},
        md  : {icon: 'fe-kind-text',   label: 'Markdown'},
        mjs : {icon: 'fe-kind-script', label: 'JavaScript module'},
        png : {icon: 'fe-kind-image',  label: 'Image'},
        svg : {icon: 'fe-kind-image',  label: 'SVG image'},
        txt : {icon: 'fe-kind-text',   label: 'Text'},
        webp: {icon: 'fe-kind-image',  label: 'Image'},
        yml : {icon: 'fe-kind-config', label: 'YAML config'}
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.FileModel'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.FileModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'collapsed', type: 'Boolean', defaultValue: true},
            {name: 'iconCls',   type: 'String',  calculate: data => data.isLeaf ? FileModel.kindOf(data.name).icon : null},
            {name: 'id',        type: 'String'},
            {name: 'isLeaf',    type: 'Boolean', defaultValue: true},
            {name: 'listing',   type: 'String',  defaultValue: null},
            {name: 'loaded',    type: 'Boolean', defaultValue: false},
            {name: 'modified',  type: 'String'},
            {name: 'name',      type: 'String'},
            {name: 'parentId',  type: 'String',  defaultValue: null},
            {name: 'size',      type: 'Integer', defaultValue: 0}
        ]
    }

    /**
     * @param {String} name A file name
     * @returns {{icon: String, label: String}} The kind its extension names, or a plain file
     */
    static kindOf(name) {
        let dot = name.lastIndexOf('.');

        return (dot > 0 && FileModel.kinds[name.slice(dot + 1).toLowerCase()]) || {icon: 'fe-kind-file', label: 'File'}
    }
}

export default Neo.setupClass(FileModel);
