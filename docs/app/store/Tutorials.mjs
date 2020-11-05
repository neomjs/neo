import Store    from '../../../src/data/Store.mjs';
import Tutorial from '../model/Tutorial.mjs';

/**
 * @class Docs.app.store.Tutorials
 * @extends Neo.data.Store
 */
class Tutorials extends Store {
    static getConfig() {return {
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
    }}
}

Neo.applyClassConfig(Tutorials);

export {Tutorials as default};