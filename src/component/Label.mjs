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
         * @member {String} tag='label'
         * @protected
         */
        tag: 'label'
    }
}

export default Neo.setupClass(Label);
