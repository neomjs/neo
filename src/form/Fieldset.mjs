import Container from '../container/Base.mjs';

/**
 * @class Neo.form.Fieldset
 * @extends Neo.container.Base
 */
class Fieldset extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.Fieldset'
         * @protected
         */
        className: 'Neo.form.Fieldset',
        /**
         * @member {String} ntype='fieldset'
         * @protected
         */
        ntype: 'fieldset',
        /**
         * @member {Array} cls=['neo-fieldset'],
         * @protected
         */
        cls: ['neo-fieldset'],
        /**
         * @member {Object} _vdom={tag: 'fieldset',cn: []}
         */
        _vdom: {
            tag: 'fieldset',
            cn : []
        }
    }}
}

Neo.applyClassConfig(Fieldset);

export {Fieldset as default};