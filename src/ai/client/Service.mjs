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
     * @param {*} value
     * @returns {*}
     */
    safeSerialize(value) {
        const type = Neo.typeOf(value);

        if (type === 'NeoInstance') {
            return value.toJSON()
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
