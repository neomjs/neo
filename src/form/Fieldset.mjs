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
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * @member {Object} _vdom={tag: 'fieldset',cn: []}
         */
        _vdom:
        {tag: 'fieldset', cn: []}
    }}

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        if (value === '') {
            // todo
        } else {
            console.log('title:', value);
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Fieldset);

export {Fieldset as default};
