import Service      from './Service.mjs';
import {admitWrite} from '../admitWrite.mjs';

/**
 * Handles generic instance-related Neural Link requests.
 * @class Neo.ai.client.InstanceService
 * @extends Neo.ai.client.Service
 */
class InstanceService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.InstanceService'
         * @protected
         */
        className: 'Neo.ai.client.InstanceService'
    }

    /**
     * Retrieves properties from a specific instance by its ID.
     * @param {Object} params
     * @param {String} params.id
     * @param {String[]} params.properties
     * @returns {Object}
     */
    getInstanceProperties({id, properties}) {
        const
            instance = Neo.get(id),
            result   = {};

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        properties.forEach(property => {
            result[property] = this.safeSerialize(Neo.ns(property, false, instance))
        });

        return {properties: result}
    }

    /**
     * Finds instances matching a selector.
     * @param {Object} params
     * @param {Object} params.selector
     * @param {String[]} [params.returnProperties]
     * @returns {Object}
     */
    findInstances({selector, returnProperties}) {
        const instances = Neo.manager.Instance.find(selector).map(instance => {
            if (Array.isArray(returnProperties) && returnProperties.length > 0) {
                const props = {};
                returnProperties.forEach(prop => {
                    props[prop] = this.safeSerialize(Neo.ns(prop, false, instance))
                });

                return {
                    className : instance.className,
                    id        : instance.id,
                    properties: props
                }
            }

            return instance.toJSON()
        });

        return {instances}
    }

    /**
     * Enforces the multi-writer write-lock before a write-class op mutates: composes the {@link Neo.ai.admitWrite}
     * decision with this heap's {@link Neo.ai.Client#writeGuard} and **throws** a deny (no mutation) when the write is
     * not admitted. A bare / legacy frame (no `context`) is unguarded — backward-compatible with non-agent callers.
     * @param {Object|null} context The Bridge-stamped `{agentId, sessionId}` writer pair, or null/undefined (legacy).
     * @param {String} id The target component id whose subtree the write locks.
     * @protected
     */
    assertWritable(context, id) {
        const {admitted, reason, conflict} = admitWrite({
            context,
            componentId: id,
            parentOf   : cid => Neo.getComponent(cid)?.parentId,
            writeGuard : this.client?.writeGuard
        });

        if (!admitted) {
            const heldBy = conflict ? ` (held by ${conflict.agentId} / ${conflict.sessionId})` : '';
            throw new Error(`Write denied for ${id}: ${reason}${heldBy}`)
        }
    }

    /**
     * Sets properties on a specific instance by its ID.
     * @param {Object} params
     * @param {String} params.id
     * @param {Object} params.properties
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object}
     */
    setInstanceProperties({id, properties}, context) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        this.assertWritable(context, id);

        instance.set(properties);

        return {success: true}
    }

    /**
     * Calls a method on a specific instance.
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.method
     * @param {Array}  [params.args]
     * @param {Object|null} [context] The Bridge-stamped agent writer pair (2nd dispatch arg); null/undefined = legacy.
     * @returns {Object}
     */
    async callMethod({id, method, args=[]}, context) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        const
            pathArray  = method.split('.'),
            methodName = pathArray.pop(),
            scope      = pathArray.length < 1 ? instance : Neo.ns(pathArray.join('.'), false, instance);

        if (!scope || typeof scope[methodName] !== 'function') {
            throw new Error(`Method not found: ${method} on instance ${id}`)
        }

        this.assertWritable(context, id);

        const result = await scope[methodName].call(scope, ...args);

        return {result: this.safeSerialize(result)}
    }
}

export default Neo.setupClass(InstanceService);
