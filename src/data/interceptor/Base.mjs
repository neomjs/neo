import CoreBase from '../../core/Base.mjs';

/**
 * @summary Awaited Pipeline hooks, implemented by ordinary Neo classes in the executing realm.
 * Value hooks return their input by default. An undefined override result also keeps the preceding
 * value. responseError must return a replacement to recover; its default preserves the rejection.
 * Hook context carries the Pipeline, operation, method and effective request params.
 * @class Neo.data.interceptor.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /** @member {String} className='Neo.data.interceptor.Base' */
        className: 'Neo.data.interceptor.Base'
    }

    /**
     * @summary Prepares the request before transport or cache lookup.
     * @param {*} params
     * @param {Object} context
     * @returns {*|Promise<*>}
     */
    request(params, context) {
        return params
    }

    /**
     * @summary Transforms a successful transport response before parsing.
     * @param {*} value
     * @param {Object} context
     * @returns {*|Promise<*>}
     */
    response(value, context) {
        return value
    }

    /**
     * @summary Preserves a transport rejection unless an override explicitly recovers it.
     * @param {*} error
     * @param {Object} context
     * @returns {*|Promise<*>}
     */
    responseError(error, context) {
        throw error
    }

    /**
     * @summary Transforms parsed data, including progressive chunks and unsolicited pushes.
     * @param {*} value
     * @param {Object} context
     * @returns {*|Promise<*>}
     */
    postParse(value, context) {
        return value
    }
}

export default Neo.setupClass(Base);
