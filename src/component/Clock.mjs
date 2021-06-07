import Component from './Base.mjs';

/**
 * Simple CSS based clock to get used inside form.field.trigger.Time
 * @class Neo.component.Clock
 * @extends Neo.component.Base
 */
class Clock extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Clock'
         * @protected
         */
        className: 'Neo.component.Clock',
        /**
         * @member {String} ntype='clock'
         * @protected
         */
        ntype: 'clock',
        /**
         * @member {String[]} cls=['neo-clock']
         */
        cls: ['neo-clock'],
        /**
         * Value in px
         * @member {Number} fontSize_=20
         */
        fontSize_: 20,
        /**
         * Value in px
         * @member {Number} size_=500
         */
        size_: 500,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-minutes']},
            {cls: ['neo-hours']}
        ]}
    }}

    /**
     * Triggered after the fontSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetFontSize(value, oldValue) {
        let style = this.style;

        style.fontSize = `${value}px`;
        this.style = style;
    }

    /**
     * Triggered after the size config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        let style = this.style;

        style.height = `${value}px`;
        style.width  = `${value}px`;
        this.style = style;
    }
}

Neo.applyClassConfig(Clock);

export {Clock as default};
