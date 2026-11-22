import Model from '../../../src/data/Model.mjs';

/**
 * @summary One stage of the pipeline as the page shows it: what it did, and how long it took in the last run on
 * each worker.
 * @class Neo.examples.data.pipeline.StageModel
 * @extends Neo.data.Model
 */
class StageModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.StageModel'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.StageModel',
        /**
         * `app` and `data` are the stage's durations in milliseconds, in the last run on the App Worker and on the
         * Data Worker; `null` while that worker has not run it.
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',     type: 'String'},
            {name: 'name',   type: 'String'},
            {name: 'detail', type: 'String'},
            {name: 'app',    type: 'Float', defaultValue: null},
            {name: 'data',   type: 'Float', defaultValue: null}
        ]
    }
}

export default Neo.setupClass(StageModel);
