import {default as BaseContainer} from '../container/Base.mjs';

/**
 * @class Neo.form.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.Container'
         * @private
         */
        className: 'Neo.form.Container',
        /**
         * @member {String} ntype='form-container'
         * @private
         */
        ntype: 'form-container',
        /**
         * @member {Array} cls=['neo-form-container'],
         * @private
         */
        cls: ['neo-form-container'],
        /**
         * @member {Object} _vdom={tag: 'form',cn: []}
         */
        _vdom: {
            tag: 'form',
            cn : []
        }
    }}

    /**
     *
     * @return {Array} fields
     */
    getFields() {
        let fields = []; // todo

        return fields;
    }
}

Neo.applyClassConfig(Container);

export {Container as default};