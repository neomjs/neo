import Store    from '../../../src/data/Store.mjs';
import Tutorial from '../model/Tutorial.mjs';

/**
 * @class Docs.store.Tutorials
 * @extends Neo.data.Store
 */
class Tutorials extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Docs.store.Tutorials'
         * @protected
         */
        className: 'Docs.store.Tutorials',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Tutorial
         */
        model: Tutorial
    }}
}

Neo.applyClassConfig(Tutorials);

export {Tutorials as default};