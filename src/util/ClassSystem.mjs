import Base from '../core/Base.mjs';

/**
 * @class Neo.util.ClassSystem
 * @extends Neo.core.Base
 */
class ClassSystem extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.util.ClassSystem'
         * @protected
         */
        className: 'Neo.util.ClassSystem'
    }}

    /**
     * can get used inside beforeSet methods in case you want to create instances like stores
     * @param {Object|Neo.core.Base|null} config
     * @param {Neo.core.Base} [DefaultClass=null]
     * @param {Object} [defaultValues={}]
     * @returns {Neo.core.Base} instance
     */
    static beforeSetInstance(config, DefaultClass=null, defaultValues={}) {
        if (!config && DefaultClass) {
            config = Neo.create(DefaultClass, defaultValues);
        } else if (config && config.isClass) {
            config = Neo.create(config, defaultValues);
        } else if (Neo.isObject(config) && !(config instanceof Neo.core.Base)) {
            if (config.ntype) {
                config = Neo.ntype({
                    ...defaultValues,
                    ...config
                });
            } else {
                config = {};

                if (DefaultClass) {
                    config.module = DefaultClass;
                }

                Object.assign(config, {
                    ...defaultValues,
                    ...config
                });

                config = Neo.create(config);
            }
        }

        return config;
    }
}

Neo.applyClassConfig(ClassSystem);

export default ClassSystem;