import Example from '../model/Example.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Docs.app.store.Examples
 * @extends Neo.data.Store
 */
class Examples extends Store {
    static config = {
        /**
         * @member {String} className='Docs.app.store.Examples'
         * @protected
         */
        className: 'Docs.app.store.Examples',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Example
         */
        model: Example,
        /**
         * @member {String} url='../../docs/examples.json'
         */
        url: '../../docs/examples.json'
    }
}

Neo.setupClass(Examples);

export default Examples;
