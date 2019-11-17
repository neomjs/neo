import {default as Component} from './Base.mjs';

/**
 * Convenience class to render a label with a text
 * @class Neo.component.Label
 * @extends Neo.component.Base
 */
class Label extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Label'
         * @private
         */
        className: 'Neo.component.Label',
        /**
         * @member {String} ntype='label'
         * @private
         */
        ntype: 'label',
        /**
         * @member {String[]} cls=['neo-label']
         */
        cls: ['neo-label'],
        /**
         * @member {String} text_=''
         */
        text_: '',
        /**
         * @member {Object} _vdom={tag: 'label'}
         */
        _vdom: {
            tag: 'label'
        }
    }}

    /**
     * Triggered after the text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetText(value) {
        let vdom = this.vdom;
        vdom.html = value;
        this.vdom = vdom;
    }
}

Neo.applyClassConfig(Label);

export {Label as default};