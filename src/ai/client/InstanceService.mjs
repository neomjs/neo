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
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.property
     * @returns {Object}
     */
    getInstanceProperty({id, property}) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        return {value: this.safeSerialize(instance[property])}
    }

    /**
     * @param {Object} params
     * @param {String} params.id
     * @param {String} params.property
     * @param {*}      params.value
     * @returns {Object}
     */
    setInstanceProperty({id, property, value}) {
        const instance = Neo.get(id);

        if (!instance) {
            throw new Error(`Instance not found: ${id}`)
        }

        instance[property] = value;

        return {success: true}
    }
}

export default Neo.setupClass(InstanceService);
