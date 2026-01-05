import Service from './Service.mjs';

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
            result[property] = this.safeSerialize(instance[property])
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
                    props[prop] = this.safeSerialize(instance[prop])
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
     * Sets properties on a specific instance by its ID.
     * @param {Object} params
     * @param {String} params.id
     * @param {Object} params.properties
     * @returns {Object}
     */
    setInstanceProperties({id, properties}) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        instance.set(properties);

        return {success: true}
    }
}

export default Neo.setupClass(InstanceService);
