import Label from './Label.mjs';

/**
 * Convenience class to render a bordered label with a text
 * @class Neo.component.BoxLabel
 * @extends Neo.component.Label
 */
class BoxLabel extends Label {
    static getConfig() {return {
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
         * @member {String[]} cls=['neo-label']
         */
        cls: ['neo-box-label', 'neo-label']
    }}
}

Neo.applyClassConfig(BoxLabel);

export {BoxLabel as default};