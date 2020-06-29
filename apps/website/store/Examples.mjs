import Example from '../model/Example.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Website.store.Examples
 * @extends Neo.data.Store
 */
class Examples extends Store {
    static getConfig() {return {
        /**
         * @member {String} className='Website.store.Examples'
         * @protected
         */
        className: 'Website.store.Examples',
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
            direction: 'ASC'
        }],
        /**
         * @member {String} url='../../apps/website/data/examples_devmode.json'
         */
        url: '../../apps/website/data/examples_devmode.json'
    }}
}

Neo.applyClassConfig(Examples);

export {Examples as default};