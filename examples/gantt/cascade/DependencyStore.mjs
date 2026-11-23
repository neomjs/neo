import BaseDependencyStore from '../../../src/gantt/DependencyStore.mjs';

export const SEED_DEPENDENCIES = [
    {id: 'd-lease-layout',    fromId: 'lease',   toId: 'layout',    type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-layout-cabling',  fromId: 'layout',  toId: 'cabling',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-cabling-rack',    fromId: 'cabling', toId: 'rack',      type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-rack-wifi',       fromId: 'rack',    toId: 'wifi',      type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-rack-desks',      fromId: 'rack',    toId: 'desks',     type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-wifi-screens',    fromId: 'wifi',    toId: 'screens',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-desks-screens',   fromId: 'desks',   toId: 'screens',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-screens-badges',  fromId: 'screens', toId: 'badges',    type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-badges-crates',   fromId: 'badges',  toId: 'crates',    type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-crates-firstday', fromId: 'crates',  toId: 'first-day', type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-mail-handback',   fromId: 'mail',    toId: 'handback',  type: 'FS', lag: 0, lagUnit: 'day'}
];

/**
 * @summary Finish-to-start links for the 10-task move chain and the 2-task side pair beside the chain.
 * @class Neo.examples.gantt.cascade.DependencyStore
 * @extends Neo.gantt.DependencyStore
 */
class DependencyStore extends BaseDependencyStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.cascade.DependencyStore'
         * @protected
         */
        className: 'Neo.examples.gantt.cascade.DependencyStore'
    }

    /**
     * @summary Populates the seeded links when constructed without initial data.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!this.getCount()) {
            this.data = SEED_DEPENDENCIES.map(edge => ({...edge}))
        }
    }
}

export default Neo.setupClass(DependencyStore);
