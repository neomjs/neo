/**
 * Provides a singleton utility for generating unique IDs.
 * @namespace Neo.core.IdGenerator
 */
const IdGenerator = {
    /**
     * The default prefix for neo instance ids
     * @member {String} base='neo-'
     */
    base: 'neo-',
    /**
     * @member {Object} idCounter={}
     */
    idCounter: {},

    /**
     * @param name
     * @returns {string}
     */
    getId(name) {
        name = name || 'neo';

        let me      = this,
            counter = me.idCounter,
            count   = counter[name] || 0;

        counter[name] = ++count;

        return me.base + (name === 'neo' ? '' : name + '-') + count;
    }
}

export default Neo.gatekeep(IdGenerator, 'Neo.core.IdGenerator', () => {
    Neo.getId = IdGenerator.getId.bind(IdGenerator);
});
