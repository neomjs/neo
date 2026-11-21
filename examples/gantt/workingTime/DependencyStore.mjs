import BaseDependencyStore from '../../../src/gantt/DependencyStore.mjs';

export const SEED_DEPENDENCIES = [
    {id: 'd1',  fromId: 't1',  toId: 't2',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd2',  fromId: 't2',  toId: 't3',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd3',  fromId: 't2',  toId: 't4',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd4',  fromId: 't4',  toId: 't5',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd5',  fromId: 't3',  toId: 't6',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd6',  fromId: 't6',  toId: 't7',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd7',  fromId: 't5',  toId: 't8',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd8',  fromId: 't6',  toId: 't8',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd9',  fromId: 't7',  toId: 't9',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd10', fromId: 't8',  toId: 't9',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd11', fromId: 't9',  toId: 't10', type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd12', fromId: 't9',  toId: 't11', type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd13', fromId: 't10', toId: 't12', type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd14', fromId: 't11', toId: 't12', type: 'FS', lag: 0, lagUnit: 'day'}
];

/**
 * @summary Finish-to-start dependency store linking the 12 kitchen renovation tasks into one directed schedule.
 * @class Neo.examples.gantt.workingTime.DependencyStore
 * @extends Neo.gantt.DependencyStore
 */
class DependencyStore extends BaseDependencyStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.workingTime.DependencyStore'
         * @protected
         */
        className: 'Neo.examples.gantt.workingTime.DependencyStore'
    }

    /**
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
