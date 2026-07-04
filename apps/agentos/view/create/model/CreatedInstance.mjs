import Model from '../../../../../src/data/Model.mjs';

/**
 * @class AgentOS.view.create.model.CreatedInstance
 * @extends Neo.data.Model
 *
 * @summary Record shape for one agent-created widget instance inside the creation module.
 *
 * A created widget is a first-class object the whole module reasons over — follow-up mutation
 * targeting ("make THE GRID bigger"), lifecycle controls, and later serialization all read this
 * shape instead of re-deriving "what exists" from the component tree. Disposed instances keep
 * their record (state flips to `disposed`) so history and serialization stay complete.
 */
class CreatedInstance extends Model {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.model.CreatedInstance'
         * @protected
         */
        className: 'AgentOS.view.create.model.CreatedInstance',
        /**
         * @member {String} keyProperty='instanceId'
         */
        keyProperty: 'instanceId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'instanceId',
            type: 'String'
        }, {
            // the registered blueprint schema id (e.g. 'grid@1') — the string key, never the schema object
            name: 'blueprintSchema',
            type: 'String'
        }, {
            name: 'title',
            type: 'String'
        }, {
            // ISO timestamp; display/serialization surface, NOT the ordering authority (creationIndex is)
            name: 'createdAt',
            type: 'String'
        }, {
            // monotonic per-registry counter — deterministic "latest created" ordering without clock reads
            name: 'creationIndex',
            type: 'Int'
        }, {
            // 'live' | 'disposed'
            name: 'state',
            type: 'String'
        }, {
            // rendering pane reference; null until the pane chrome mounts the instance
            name        : 'paneRef',
            defaultValue: null
        }, {
            // the full accepted blueprint (untyped passthrough object) — the mutation/serialization source
            name: 'blueprintSnapshot'
        }]
    }
}

export default Neo.setupClass(CreatedInstance);
