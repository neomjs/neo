import Base from '../../core/Base.mjs';

/**
 * Base class for Neural Link Client Services.
 * @class Neo.ai.client.Service
 * @extends Neo.core.Base
 */
class Service extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.Service'
         * @protected
         */
        className: 'Neo.ai.client.Service',
        /**
         * @member {Neo.ai.Client|null} client=null
         * @protected
         */
        client: null
    }

    /**
     * @summary Serializes a property value for the wire. Plain objects and arrays serialize in
     * full; a Neo INSTANCE collapses to its `toJSON()` identity snapshot — which is a truncation
     * of the instance's object graph, so the snapshot carries a `__truncated` marker making the
     * collapse machine-distinguishable from a genuinely small value. Without the marker, a deep
     * structure read (a `vnode` tree, a hosted store) looks like confident evidence of a tiny
     * object — a silent false negative in exactly the whitebox-debugging situations this wire
     * exists for. Structure-shaped reads belong to the tree tools (`query_vdom`,
     * `get_component_tree`, `inspect_component_render_tree`).
     * @param {*} value
     * @returns {*}
     */
    safeSerialize(value) {
        const type = Neo.typeOf(value);

        if (type === 'NeoInstance') {
            return {...value.toJSON(), __truncated: 'neo-instance-snapshot'}
        }

        if (type === 'Object') {
            const result = {};
            Object.entries(value).forEach(([k, v]) => {
                result[k] = this.safeSerialize(v)
            });
            return result
        }

        if (type === 'Array') {
            return value.map(v => this.safeSerialize(v))
        }

        return value
    }
}

export default Neo.setupClass(Service);
