import MainModel from './MainModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @summary 5,000 records — the point of the example is that the DOM pool does NOT grow with this.
 *
 * Generated rather than literal: a hand-written array long enough to exercise windowing would be
 * unreadable, and the exact values carry no meaning. `id` is the `keyProperty`, so it doubles as the
 * logical index and lets a reader (or a test) predict which record belongs at any scroll offset —
 * `Math.floor(scrollTop / itemHeight)`. That predictability is what makes the store usable as a
 * scroll-fidelity fixture.
 * @member {Object[]} data
 */
const recordCount = 5000;

/**
 * @class Neo.examples.list.buffered.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.list.buffered.MainStore',
        keyProperty: 'id',
        model      : MainModel,

        data: Array.from({length: recordCount}, (_, id) => ({id, name: `Record ${id}`}))
    }
}

export default Neo.setupClass(MainStore);
