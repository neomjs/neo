import Base from '../core/Base.mjs';

/**
 * @class Neo.util.ClassSystem
 * @extends Neo.core.Base
 */
class ClassSystem extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.ClassSystem'
         * @protected
         */
        className: 'Neo.util.ClassSystem'
    }

    /**
     * can get used inside beforeSet methods in case you want to create instances like stores
     * @param {Object|Neo.core.Base|null} config
     * @param {Neo.core.Base|String} [DefaultClass=null]
     * @param {Object} [defaultValues={}]
     * @returns {Neo.core.Base} instance
     */
    static beforeSetInstance(config, DefaultClass=null, defaultValues={}) {
        let configType = Neo.typeOf(config);

        if (Neo.isString(DefaultClass)) {
            DefaultClass = Neo.ns(DefaultClass)
        }

        if (!config && DefaultClass) {
            config = Neo.create(DefaultClass, defaultValues)
        } else if (configType === 'NeoClass') {
            config = Neo.create(config, defaultValues)
        } else if (configType === 'Object') {
            if (config.ntype) {
                config = Neo.ntype({
                    ...defaultValues,
                    ...config
                })
            } else {
                let newConfig = {};

                if (DefaultClass) {
                    newConfig.module = DefaultClass
                }

                Object.assign(newConfig, {
                    ...defaultValues,
                    ...config
                });

                config = Neo.create(newConfig)
            }
        } else if (configType === 'NeoInstance') {
            if (defaultValues?.listeners) {
                config.on(defaultValues.listeners)
            }
        }

        return config
    }
}

export default Neo.setupClass(ClassSystem);
