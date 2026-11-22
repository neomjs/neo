import List       from '../../../src/list/Base.mjs';
import StageModel from './StageModel.mjs';

/**
 * @summary The stages of the pipeline in the order they run: a card each with what it did and how long it took on
 * each worker. The two durations stand side by side, because they are what the two runs have in common: the work is
 * the same, only the worker that does it differs.
 *
 * @class Neo.examples.data.pipeline.StageList
 * @extends Neo.list.Base
 */
class StageList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.StageList'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.StageList',
        /**
         * @member {String[]} cls=['neo-examples-data-pipeline-stages']
         * @reactive
         */
        cls: ['neo-examples-data-pipeline-stages'],
        /**
         * @member {Boolean} disableSelection=true
         * @reactive
         */
        disableSelection: true,
        /**
         * @member {Object} store
         * @reactive
         */
        store: {
            model: StageModel,
            data : [
                {id: 'request',    name: 'Request hook',    detail: 'takes the paging params off the request'},
                {id: 'connection', name: 'Connection',      detail: 'reads the payload and parses its JSON'},
                {id: 'response',   name: 'Response hook',   detail: 'unwraps the orders from the response'},
                {id: 'postParse',  name: 'Post-parse hook', detail: 'turns the orders into a report per country'},
                {id: 'normalizer', name: 'Normalizer',      detail: 'hands the rows and their count to the store'}
            ]
        }
    }

    /**
     * @summary A stage's name, its duration on each worker and what it did.
     * @param {Object} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        const run = (mode, label) => {
            const duration = record[mode];

            return {cls: ['neo-examples-data-pipeline-stage-run'], cn: [
                {tag: 'span', cls: ['neo-examples-data-pipeline-worker', `neo-ran-on-${mode}`], text: label},
                {tag: 'span', cls: ['neo-examples-data-pipeline-stage-duration'], text: duration === null ? '–' : `${duration < 10 ? duration.toFixed(1) : Math.round(duration)} ms`}
            ]}
        };

        return [
            {tag: 'span', cls: ['neo-examples-data-pipeline-stage-name'], text: record.name},
            run('app',  'App worker'),
            run('data', 'Data worker'),
            {tag: 'span', cls: ['neo-examples-data-pipeline-stage-detail'], text: record.detail}
        ]
    }
}

export default Neo.setupClass(StageList);
