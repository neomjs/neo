import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.component.Timer
 * @extends Neo.component.Base
 */
class Timer extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Timer'
         * @protected
         */
        className: 'Neo.component.Timer',
        /**
         * @member {String} ntype='timer'
         * @protected
         */
        ntype: 'timer',
        /**
         * CSS selectors to apply to the root level node of this component
         * @member {String[]} baseCls=['timer']
         */
        baseCls: ['neo-timer'],
        /**
         * End color of the circle. If not set, it uses the css default
         * @member {Number|String} colorEnd_=null
         */
        colorEnd_: null,
        /**
         * Start color of the circle. If not set, it uses the css default
         * @member {Number|String} colorStart_=null
         */
        colorStart_: null,
        /**
         * Start time. This might be '5m', '30s' or milliseconds as number
         * @member {Number|String} duration_='5m'
         */
        duration_: '10m',
        /**
         * Defines height and min-width. This can be a number in px or a string.
         * @member {Number|String} dimensions_='6rem'
         */
        dimensions_: '8em',
        /**
         * Helper to keep running smooth at minimum cost
         * @member {Object}      timer={}
         * @member {Number|null} timer.currentSecond =null // run only once per second
         * @member {Number|null} timer.intervalId    =null // setInterval id
         * @member {Boolean}     timer.running       =false// keeps track if timer/entry is up
         * @member {Number|null} timer.startTime     =null // calc the current progress
         */
        timer: {
            currentSecond: null,
            intervalId   : null,
            running      : false,
            startTime    : null
        },
        /**
         * The vdom markup for this component.
         * @member {Object} vdom={}
         */
        vdom:
        {cn: [
            {cls: 'countdown', cn: [
                {tag: 'svg', cls: 'clock', viewBox: '-50 -50 100 100', strokeWidth: '10', cn: [
                    {tag: 'circle', r: 45},
                    {tag: 'circle', r: 45, pathLength: 1}
                ]},
                {cls: ['flip-card'], cn : [
                    {cls: 'flip-card-inner enter-mask', cn : [
                        {cls: 'flip-card-front', cn : [
                            {tag: 'input', cls: 'enter-time'},
                            {tag: 'button',cls: 'fa fa-play'}
                        ]},
                        {cls: 'flip-card-back', cn : [
                            {cls: 'runner', html: '00:00'}
                        ]}
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click   : me.onTimerClick,   delegate: 'flip-card-back'},
            {click   : me.onTimerClick,   delegate: 'fa fa-play'},
            {input   : me.onTimerInput,   delegate: 'enter-time'},
            {focusout: me.onTimerInput,   delegate: 'enter-time'},
            {keydown : me.onFieldKeyDown, delegate: 'enter-time'}
        ])
    }

    /**
     * Triggered after the dimensions config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @protected
     */
    afterSetDimensions(value, oldValue) {
        if (typeof value === 'number') {
            value = value + 'px'
        }

        this.updateProperties({dimensions: value})
    }

    /**
     * Triggered after the colorStart config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetColorStart(value, oldValue) {
        value && this.updateProperties({colorStart: value})
    }

    /**
     * Triggered after the colorEnd config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetColorEnd(value, oldValue) {
        value && this.updateProperties({colorEnd: value})
    }

    /**
     * Triggered before the duration config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetDuration(value, oldValue) {
        let me = this,
            durationType;

        me.updateInputField(value)

        if (Neo.isString(value)) {
            durationType = value.at(-1);

            if (durationType === 'm') {
                value = value.split('m')[0] * 60 * 1000
            } else if (durationType === 's') {
                value = value.split('s')[0] * 1000
            }
        }

        me.updateProperties({full: value});

        return value
    }

    /**
     * Check if Enter was pressed
     * @param {Object} data
     */
    onFieldKeyDown(data) {
        let me = this;

        if (data.key === 'Enter') {
            me.duration = me.timer.entry;
            me.onTimerClick()
        }
    }

    /**
     * Click on Play or Timer
     */
    onTimerClick() {
        let me = this;

        // If the timer is running, stop and clear it
        if (me.timer.intervalId) {
            me.toggleTimer(false);
            me.resetTimer()
        } else {
            // prepare
            me.timer.startTime = new Date().getTime();

            me.timer.intervalId = setInterval(function () {
                const startTime = me.timer.startTime,
                      curTime   = new Date().getTime(),
                      totalTime = me.duration,
                      endTime   = startTime + totalTime;

                if (curTime > endTime) {
                    me.toggleTimer(false);
                    me.resetTimer()
                } else {
                    const milliseconds = endTime - curTime,
                          secondsLeft  = Math.floor(milliseconds / 1000);
                    let secondsNow = secondsLeft % 60,
                        minutesNow = Math.floor(secondsLeft / 60)

                    // Ensure this does not run 10 times a second
                    if (secondsNow !== me.timer.currentSecond) {
                        me.timer.currentSecond = secondsNow;

                        secondsNow = secondsNow.toString().padStart(2, '0');
                        minutesNow = minutesNow.toString().padStart(2, '0');

                        me.updateTimer(`${minutesNow}:${secondsNow}`);
                        me.updateProperties({current: milliseconds});
                        me.toggleTimer(true)
                    }
                }
            }, 100)
        }
    }

    /**
     * On change event of the textfield
     * @param {Object} data
     */
    onTimerInput(data) {
        let me = this;

        if (data.value) {
            me.timer.entry = data.value
        } else {
            me.duration = me.timer.entry
        }
    }

    /**
     * Reset the properties, timer and remove Interval
     */
    resetTimer() {
        let me = this;

        me.updateProperties({current: ''});
        me.updateTimer('00:00');

        clearInterval(me.timer.intervalId);
        delete me.timer.intervalId
    }

    /**
     * Flip over the timer face
     * @param {Boolean} doShow
     */
    toggleTimer(doShow) {
        if(this.running === doShow) return;

        let me       = this,
            flipCard = me.vdom.cn[0].cn[1];

        me.running = doShow;

        flipCard.cls = flipCard.cls || [];

        NeoArray[doShow ? 'add' : 'remove'](flipCard.cls, 'turn');
        me.update()
    }

    /**
     * Write to the input field
     * @param {String} value
     */
    updateInputField(value) {
        let me         = this,
            inputField = me.vdom.cn[0].cn[1].cn[0].cn[0].cn[0];

        inputField.value = value;
    }

    /**
     * Update the timer, typically once per second
     * @param {String} value
     */
    updateTimer(value) {
        let me    = this,
            timer = me.vdom.cn[0].cn[1].cn[0].cn[1].cn[0];

        timer.innerHTML = value;
        me.update()
    }

    /**
     * Update the css properties
     * - current amount of seconds left
     * - full amount of time
     * - size of the timer
     * @param {Object} properties
     */
    updateProperties(properties) {
        let {style} = this;

        if (properties.current !== undefined) {
            style['--neo-timer-current'] = `${properties.current}!important`
        }
        if (properties.full !== undefined) {
            style['--neo-timer-full'] = `${properties.full}!important`
        }
        if (properties.colorEnd !== undefined) {
            style['--timer-color-end'] = `${properties.colorEnd}!important`
        }
        if (properties.colorStart !== undefined) {
            style['--timer-color-start'] = `${properties.colorStart}!important`
        }
        if (properties.dimensions !== undefined) {
            style['--timer-dimension'] = `${properties.dimensions}!important`
        }

        this.style = style
    }
}

export default Neo.setupClass(Timer);
