import Container from '../container/Base.mjs';
import Legend    from '../component/Legend.mjs';

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
         * @member {String} title_=''
         */
        title_: '',
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
        let me        = this,
            items     = me.items,
            hasLegend = items[0].module === Legend;

        if (value === '') {
            if (hasLegend) {
                me.removeAt(0);
            }
        } else {
            if (hasLegend) {
                items[0].text = value;
            } else {
                me.insert(0, {
                    module: Legend,
                    text  : value
                });
            }

            me.items = items;
        }
    }
}

Neo.applyClassConfig(Fieldset);

export {Fieldset as default};
