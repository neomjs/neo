import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * Simple CSS based clock to get used inside form.field.trigger.Time
 * @class Neo.component.Clock
 * @extends Neo.component.Base
 */
class Clock extends Component {
    static config = {
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
         * @member {String[]} baseCls=['neo-clock']
         */
        baseCls: ['neo-clock'],
        /**
         * Value in px
         * @member {Number} fontSize_=20
         */
        fontSize_: 20,
        /**
         * Show a small disc on the center of the clock (above the pointers)
         * @member {Boolean} showDisc_=true
         */
        showDisc_: true,
        /**
         * Value in px
         * @member {Number|null} size_=500
         */
        size_: 500,
        /**
         * Format: hh:mm
         * @member {String} time_='10:20'
         */
        time_: '00:00',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-minutes'], style: {}},
            {cls: ['neo-hours'],   style: {}}
        ]}
    }

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
     * Triggered after the showDisc config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowDisc(value, oldValue) {
        let cls = this.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-show-disc')
        this.cls = cls;
    }

    /**
     * Triggered after the size config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        let style = this.style;

        if (Neo.isNumber(value)) {
            style.height = `${value}px`;
            style.width  = `${value}px`;
        } else {
            delete style.height;
            delete style.width;
        }

        this.style = style;
    }

    /**
     * Triggered after the time config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTime(value, oldValue) {
        let timeArray    = value.split(':').map(e => Number(e)),
            hoursAngle   = 30 * (timeArray[0] % 12) + .5 * timeArray[1],
            minutesAngle = timeArray[1] * 6,
            vdom         = this.vdom;

        vdom.cn[0].style.transform = `rotate(${minutesAngle}deg)`;
        vdom.cn[1].style.transform = `rotate(${hoursAngle}deg)`;

        this.update();
    }
}

Neo.setupClass(Clock);

export default Clock;
