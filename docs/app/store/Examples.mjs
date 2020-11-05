import Example from '../model/Example.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Docs.store.Examples
 * @extends Neo.data.Store
 */
class Examples extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.store.Examples'
         * @protected
         */
        className: 'Docs.store.Examples',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Example
         */
        model: Example
    }}
}

Neo.applyClassConfig(Examples);

export {Examples as default};