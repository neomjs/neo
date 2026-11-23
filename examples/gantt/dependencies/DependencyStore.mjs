import BaseDependencyStore from '../../../src/gantt/DependencyStore.mjs';

// Eight links, at least one of each type, between eight of the fourteen tasks. The landing page runs alongside the
// video: it starts with it and finishes no earlier. A day of store review and two of page checks precede the launch.
export const SEED_DEPENDENCIES = [
    {id: 'freeze-bugs',      fromId: 'freeze',  toId: 'bugs',    type: 'FS', lag: 0, lagUnit: 'day'},
    {id: 'bugs-submit',      fromId: 'bugs',    toId: 'submit',  type: 'FS', lag: 1, lagUnit: 'day'},
    {id: 'bugs-notes',       fromId: 'bugs',    toId: 'notes',   type: 'FF', lag: 0, lagUnit: 'day'},
    {id: 'video-landing-ss', fromId: 'video',   toId: 'landing', type: 'SS', lag: 0, lagUnit: 'day'},
    {id: 'video-landing-ff', fromId: 'video',   toId: 'landing', type: 'FF', lag: 0, lagUnit: 'day'},
    {id: 'submit-golive',    fromId: 'submit',  toId: 'golive',  type: 'FS', lag: 1, lagUnit: 'day'},
    {id: 'landing-golive',   fromId: 'landing', toId: 'golive',  type: 'FS', lag: 2, lagUnit: 'day'},
    {id: 'golive-beta',      fromId: 'golive',  toId: 'beta',    type: 'SF', lag: 0, lagUnit: 'day'}
];

/**
 * @summary The launch plan's links: eight to begin with, in all four types. A link drawn by drag adds a
 * finish-to-start record here.
 * @class Neo.examples.gantt.dependencies.DependencyStore
 * @extends Neo.gantt.DependencyStore
 */
class DependencyStore extends BaseDependencyStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.gantt.dependencies.DependencyStore'
         * @protected
         */
        className: 'Neo.examples.gantt.dependencies.DependencyStore'
    }

    /**
     * @summary Populates the eight starting links when constructed without initial data.
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
