import List      from '../../../../src/list/Base.mjs';
import ListModel from '../../../../src/selection/ListModel.mjs';
import Store     from '../../../../src/data/Store.mjs';

/**
 * @summary The Photos app: the team's portraits as a wall of photos with their names. The portraits and the names
 * ship with the repository (`resources/examples`).
 * @class WebDesktop.view.apps.Photos
 * @extends Neo.list.Base
 */
class Photos extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Photos'
         * @protected
         */
        className: 'WebDesktop.view.apps.Photos',
        /**
         * @member {String[]} baseCls=['webdesktop-photos','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-photos', 'neo-list'],
        /**
         * @member {Object} selectionModel={module:ListModel}
         */
        selectionModel: {module: ListModel},
        /**
         * @member {Object} store
         */
        store: {
            module  : Store,
            autoLoad: true,
            model   : {
                fields: [
                    {name: 'firstname', type: 'String'},
                    {name: 'id',        type: 'Integer'},
                    {name: 'image',     type: 'String'},
                    {name: 'lastname',  type: 'String'}
                ]
            },
            url: new URL(Neo.config.basePath + 'resources/examples/data/ai_contacts.json', Neo.config.url.base).href
        }
    }

    /**
     * @param {Neo.data.Record} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        let name = `${record.firstname} ${record.lastname}`;

        return [
            {tag: 'img', alt: name, loading: 'lazy', src: `${Neo.config.basePath}resources/examples/${record.image}`},
            {cls: ['webdesktop-photos-name'], text: name}
        ]
    }
}

export default Neo.setupClass(Photos);
