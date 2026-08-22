import Model from '../../../src/data/Model.mjs';

const
    SECTIONS = new Set(['running', 'queued', 'recent']),
    SOURCES  = new Set(['orchestrator', 'mc', 'kb']);

/**
 * @class AgentOS.model.FleetTask
 * @extends Neo.data.Model
 *
 * @summary One view-projection record in the Fleet Tasks pane: a single row of the `fleetTasks`
 * envelope as the source reduced it — a running, queued, or recently completed unit of work with
 * its governing instant, its state word, its optional progress fact, and the source it came from.
 * The model is intentionally thin: it stores projection input and derives no second truth. The
 * converts are the rendering guards — an unknown section or source becomes `null` and the pane
 * names it rather than mis-filing the row, and a progress fact survives only when both counts are
 * real integers.
 */
class FleetTask extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.model.FleetTask'
         * @protected
         */
        className: 'AgentOS.model.FleetTask',
        /**
         * @member {String} keyProperty='id'
         * @reactive
         */
        keyProperty: 'id',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name        : 'section',
            type        : 'String',
            convert     : value => SECTIONS.has(value) ? value : null,
            defaultValue: null
        }, {
            name        : 'name',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            name        : 'source',
            type        : 'String',
            convert     : value => SOURCES.has(value) ? value : null,
            defaultValue: null
        }, {
            name        : 'state',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            name        : 'at',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            name        : 'progressKind',
            type        : 'String',
            convert     : value => value === 'determinate' || value === 'backlog' ? value : null,
            defaultValue: null
        }, {
            name        : 'progressDone',
            type        : 'Integer',
            convert     : value => Number.isInteger(value) && value >= 0 ? value : null,
            defaultValue: null
        }, {
            name        : 'progressTotal',
            type        : 'Integer',
            convert     : value => Number.isInteger(value) && value > 0 ? value : null,
            defaultValue: null
        }, {
            name        : 'detail',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            // ── projection-row vocabulary: the pane's Store is a PROJECTION of one
            // envelope into exactly what the tasks list renders, so the record set carries the
            // list's own structural rows — section headers and honest empty lines — beside the
            // task rows. `isHeader` is the list.Base `useHeaders` contract field.
            name        : 'isHeader',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name        : 'rowKind',
            type        : 'String',
            convert     : value => value === 'header' || value === 'empty' ? value : 'task',
            defaultValue: 'task'
        }, {
            // header rows: the section label · empty rows: the honest empty sentence
            name        : 'label',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            // header rows only: the freshness pill word (`sample` · `live` · `unavailable`)
            name        : 'pill',
            type        : 'String',
            convert     : value => typeof value === 'string' && value ? value : null,
            defaultValue: null
        }, {
            // cold-spine rows render the `sample` pill instead of a source claim
            name        : 'sample',
            type        : 'Boolean',
            defaultValue: false
        }]
    }
}

export default Neo.setupClass(FleetTask);
