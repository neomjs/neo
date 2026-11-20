import StepModel from './StepModel.mjs';
import Store     from '../../../src/data/Store.mjs';

/**
 * @summary The release checklist, sorted by `order`.
 *
 * `Neo.draggable.list.SortZone` writes a drop into `order`, and the sorter re-sorts on that change
 * (`reapplyOnRecordChange`), so the list always renders the store's order.
 * @class Neo.examples.list.reorder.StepStore
 * @extends Neo.data.Store
 */
class StepStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.list.reorder.StepStore'
         * @protected
         */
        className: 'Neo.examples.list.reorder.StepStore',
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, order: 0, text: 'Freeze the release branch'},
            {id: 2, order: 1, text: 'Run the full test suite'},
            {id: 3, order: 2, text: 'Write the release notes'},
            {id: 4, order: 3, text: 'Bump the version'},
            {id: 5, order: 4, text: 'Tag the release'},
            {id: 6, order: 5, text: 'Publish to npm'},
            {id: 7, order: 6, text: 'Deploy the website'},
            {id: 8, order: 7, text: 'Announce the release'}
        ],
        /**
         * @member {Neo.data.Model} model=StepModel
         */
        model: StepModel,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{property: 'order', reapplyOnRecordChange: true}]
    }
}

export default Neo.setupClass(StepStore);
