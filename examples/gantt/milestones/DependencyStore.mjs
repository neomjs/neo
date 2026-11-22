import BaseDependencyStore from '../../../src/gantt/DependencyStore.mjs';

export const SEED_DEPENDENCIES = [
    {id: 'd-spec-g1',    fromId: 'spec',       toId: 'gate-spec',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-g1-pcb',     fromId: 'gate-spec',  toId: 'pcb',         type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-pcb-g2',     fromId: 'pcb',        toId: 'gate-proto',  type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-g2-dsp',     fromId: 'gate-proto', toId: 'dsp',         type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-dsp-g3',     fromId: 'dsp',        toId: 'gate-code',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-g3-emc',     fromId: 'gate-code',  toId: 'emc',         type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-emc-g4',     fromId: 'emc',        toId: 'gate-cert',   type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-g4-pilot',   fromId: 'gate-cert',  toId: 'pilot',       type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-pilot-g5',   fromId: 'pilot',      toId: 'gate-rc',     type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-g5-kit',     fromId: 'gate-rc',    toId: 'kit',         type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'd-kit-g6',     fromId: 'kit',        toId: 'gate-launch', type: 'FS', lag: 0, lagUnit: 'day'}
];

/**
 * @summary Finish-to-start links routing each launch task into its phase gate and each gate into the next task.
 * @class Neo.examples.gantt.milestones.DependencyStore
 * @extends Neo.gantt.DependencyStore
 */
class DependencyStore extends BaseDependencyStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.milestones.DependencyStore'
         * @protected
         */
        className: 'Neo.examples.gantt.milestones.DependencyStore'
    }

    /**
     * @summary Populates the seeded gate links when constructed without initial data.
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
