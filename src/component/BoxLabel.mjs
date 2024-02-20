import Label from './Label.mjs';

/**
 * Convenience class to render a bordered label with a text
 * @class Neo.component.BoxLabel
 * @extends Neo.component.Label
 */
class BoxLabel extends Label {
    static config = {
        /**
         * @member {String} className='Neo.component.BoxLabel'
         * @protected
         */
        className: 'Neo.component.BoxLabel',
        /**
         * @member {String} ntype='box-label'
         * @protected
         */
        ntype: 'box-label',
        /**
         * @member {String[]} baseCls=['neo-box-label','neo-label']
         */
        baseCls: ['neo-box-label', 'neo-label']
    }
}

Neo.setupClass(BoxLabel);

export default BoxLabel;
