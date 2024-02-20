import Store    from '../../../src/data/Store.mjs';
import Tutorial from '../model/Tutorial.mjs';

/**
 * @class Docs.app.store.Tutorials
 * @extends Neo.data.Store
 */
class Tutorials extends Store {
    static config = {
        /**
         * @member {String} className='Docs.app.store.Tutorials'
         * @protected
         */
        className: 'Docs.app.store.Tutorials',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Tutorial
         */
        model: Tutorial
    }
}

Neo.setupClass(Tutorials);

export default Tutorials;
