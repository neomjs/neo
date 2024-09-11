import Example from '../model/Example.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Examples
 * @extends Neo.data.Store
 */
class Examples extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Examples'
         * @protected
         */
        className: 'Portal.store.Examples',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Example
         */
        model: Example,
        /**
         * @member {Object[]} sorters=[{property: 'id', direction: 'ASC'}]
         */
        sorters: [{
            property : 'id',
            direction: 'DESC'
        }]
    }
}

export default Neo.setupClass(Examples);
