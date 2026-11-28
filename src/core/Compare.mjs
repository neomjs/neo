/**
 * @class Neo.core.Compare
 */
class Compare {
    /**
     * Storing the comparison method names by data type
     * @member {Object} map
     */
    static map = {
        Array      : 'compareArrays',
        Date       : 'compareDates',
        Function   : 'compareFunctions',
        Map        : 'compareMaps',
        NeoInstance: 'compareNeoInstances',
        Object     : 'compareObjects',
        RegExp     : 'compareRegExps',
        Set        : 'compareSets'
    }

    /**
     * @param {Array} item1
     * @param {Array} item2
     * @param {WeakMap} [seen] The pairs already being compared, see isEqual()
     * @returns {Boolean}
     */
    static compareArrays(item1, item2, seen = new WeakMap()) {
        if (Compare.isComparing(item1, item2, seen)) {
            return true
        }

        if (item1.length !== item2.length) {
            return false
        }

        for (const [i, v] of item1.entries()) {
            if (!Compare.isEqual(v, item2[i], seen)) {
                return false
            }
        }

        return true
    }

    /**
     * @param {Date} item1
     * @param {Date} item2
     * @returns {Boolean}
     */
    static compareDates(item1, item2) {
        const time1 = item1.valueOf(),
              time2 = item2.valueOf();

        // invalid dates have the time value NaN
        return time1 === time2 || (Number.isNaN(time1) && Number.isNaN(time2))
    }

    /**
     * @param {Function} item1
     * @param {Function} item2
     * @returns {Boolean}
     */
    static compareFunctions(item1, item2) {
        if (item1.name !== item2.name) {
            return false
        }

        return item1.toString() === item2.toString()
    }

    /**
     * @param {Map} item1
     * @param {Map} item2
     * @returns {Boolean}
     */
    static compareMaps(item1, item2) {
        if (item1.size !== item2.size) {
            return false
        }

        let val2;

        for (const [key, val] of item1) {
            val2 = item2.get(key);

            if (val2 !== val || val2 === undefined && !item2.has(key)) {
                return false
            }
        }

        return true
    }

    /**
     * @param {Neo.core.Base} item1
     * @param {Neo.core.Base} item2
     * @returns {Boolean}
     */
    static compareNeoInstances(item1, item2) {
        return item1.id === item2.id
    }

    /**
     * Objects are equal when they have the same own enumerable keys with equal values.
     * @param {Object} item1
     * @param {Object} item2
     * @param {WeakMap} [seen] The pairs already being compared, see isEqual()
     * @returns {Boolean}
     */
    static compareObjects(item1, item2, seen = new WeakMap()) {
        if (Compare.isComparing(item1, item2, seen)) {
            return true
        }

        const keys = Object.keys(item1);

        if (keys.length !== Object.keys(item2).length) {
            return false
        }

        for (const key of keys) {
            if (!Object.hasOwn(item2, key) || !Compare.isEqual(item1[key], item2[key], seen)) {
                return false
            }
        }

        return true
    }

    /**
     * @param {RegExp} item1
     * @param {RegExp} item2
     * @returns {Boolean}
     */
    static compareRegExps(item1, item2) {
        return item1.toString() === item2.toString()
    }

    /**
     * @param {Set} item1
     * @param {Set} item2
     * @returns {Boolean}
     */
    static compareSets(item1, item2) {
        if (item1.size !== item2.size) {
            return false
        }

        for (let key of item1) {
            if (!item2.has(key)) {
                return false
            }
        }

        return true
    }

    /**
     * Records that item1 and item2 are being compared.
     * A pair that is already in progress counts as equal, so cyclic structures end the walk.
     * When a nested pair is not equal, the whole comparison is false, so a recorded pair never hides a difference.
     * @param {Array|Object} item1
     * @param {Array|Object} item2
     * @param {WeakMap} seen Maps item1 to the Set of items it is being compared with
     * @returns {Boolean} true if the pair was already in progress
     */
    static isComparing(item1, item2, seen) {
        let partners = seen.get(item1);

        if (partners?.has(item2)) {
            return true
        }

        if (!partners) {
            partners = new Set();
            seen.set(item1, partners)
        }

        partners.add(item2);

        return false
    }

    /**
     * Compares two values by type.
     * Objects need the same own enumerable keys with equal values.
     * Arrays compare by position.
     * NaN equals NaN (also as the time value of invalid dates), while 0 and -0 stay equal.
     * Cyclic objects and arrays are compared without recursing forever.
     * Functions compare by name and source text.
     * Map values and Set members compare by identity.
     * @param {*} item1
     * @param {*} item2
     * @param {WeakMap} [seen] Used internally for the pairs already being compared
     * @returns {Boolean}
     */
    static isEqual(item1, item2, seen) {
        if (item1 === item2) {
            return true
        }

        let type1 = Neo.typeOf(item1),
            type2 = Neo.typeOf(item2);

        if (type1 !== type2) {
            return false
        }

        if (Compare.map[type1]) {
            return Compare[Compare.map[type1]](item1, item2, seen)
        }

        // all other types: NaN is the only value that is not equal to itself
        return Number.isNaN(item1) && Number.isNaN(item2)
    }
}

export default Neo.gatekeep(Compare, 'Neo.core.Compare', () => {
    // alias
    Neo.isEqual = Compare.isEqual
});
