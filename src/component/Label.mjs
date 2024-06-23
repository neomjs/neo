import Component from './Base.mjs';

/**
 * Convenience class to render a label with a text
 * @class Neo.component.Label
 * @extends Neo.component.Base
 */
class Label extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Label'
         * @protected
         */
        className: 'Neo.component.Label',
        /**
         * @member {String} ntype='label'
         * @protected
         */
        ntype: 'label',
        /**
         * @member {String[]} baseCls=['neo-label']
         */
        baseCls: ['neo-label'],
        /**
         * @member {String} text_=''
         */
        text_: '',
        /**
         * @member {Object} _vdom={tag: 'label'}
         */
        _vdom:
        {tag: 'label', draggable: false}
    }

    /**
     * Triggered after the text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        this.vdom.html = value;
        this.update()
    }
}

Neo.setupClass(Label);

export default Label;
