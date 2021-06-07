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
         * @member {Object} _vdom={tag: 'label'}
         */
        _vdom:
        {cn: [

        ]}
    }}
}

Neo.applyClassConfig(Clock);

export {Clock as default};
