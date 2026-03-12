import Neo from '../../Neo.mjs';

/**
 * @summary The base class for data normalizers.
 *
 * A normalizer is part of the data pipeline (`Connection -> Parser -> Normalizer -> Store`).
 * While parsers extract data and total counts from an external format (like JSON or XML),
 * normalizers are responsible for structural reshaping of the native JavaScript objects
 * before they enter the Store.
 *
 * For example, a Tree Normalizer might take a nested hierarchical array of objects and
 * flatten it into a 1D array while injecting parentId relations.
 *
 * @class Neo.data.normalizer.Base
 * @extends Neo.core.Base
 */
class Base extends Neo.core.Base {
    static config = {
        /**
         * @member {String} className='Neo.data.normalizer.Base'
         * @protected
         */
        className: 'Neo.data.normalizer.Base',
        /**
         * @member {String} ntype='normalizer-base'
         * @protected
         */
        ntype: 'normalizer-base'
    }

    /**
     * Reshapes the input data into a structure suitable for a Store.
     * Override this method in subclasses to implement specific normalization logic.
     * @param {Object|Array} data The raw JavaScript data structure (e.g. from a Parser).
     * @returns {Object} An object containing the normalized `data` array and optional metadata (like `totalCount`).
     */
    normalize(data) {
        return {
            data,
            totalCount: Array.isArray(data) ? data.length : 1
        };
    }
}

export default Neo.setupClass(Base);