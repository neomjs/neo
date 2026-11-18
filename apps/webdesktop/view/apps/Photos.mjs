import Gallery from '../../../../src/component/Gallery.mjs';
import Store   from '../../../../src/data/Store.mjs';

/**
 * @summary The Photos app: the team's portraits in the engine's gallery. Arrow keys and the mouse wheel move through
 * them; the portraits and their names ship with the repository (`resources/examples`).
 * @class WebDesktop.view.apps.Photos
 * @extends Neo.component.Gallery
 */
class Photos extends Gallery {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Photos'
         * @protected
         */
        className: 'WebDesktop.view.apps.Photos',
        /**
         * @member {Number} amountRows=2
         */
        amountRows: 2,
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
            url: Neo.config.basePath + 'resources/examples/data/ai_contacts.json'
        }
    }
}

export default Neo.setupClass(Photos);
