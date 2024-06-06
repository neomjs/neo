import Component from '../../../src/controller/Component.mjs';

/**
 * @class Colors.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Colors.view.ViewportController'
         * @protected
         */
        className: 'Colors.view.ViewportController'
    }

    /**
     * @member {Number|null} intervalId
     */
    intervalId = null

    generateData() {
        let me   = this,
            data = [],
            i    = 0,
            len  = 20;

        for (; i < len; i++) {
            data.push({
                id     : `row_${i + 1}`,
                columnA: me.getRandomInteger(),
                columnB: me.getRandomInteger(),
                columnC: me.getRandomInteger(),
                columnD: me.getRandomInteger(),
                columnE: me.getRandomInteger(),
                columnF: me.getRandomInteger(),
                columnG: me.getRandomInteger(),
                columnH: me.getRandomInteger(),
                columnI: me.getRandomInteger(),
                columnJ: me.getRandomInteger()
            })
        }

        return data
    }

    /**
     * @returns {Number}
     */
    getRandomInteger() {
        return Math.floor(Math.random() * 5) + 1
    }

    /**
     *
     */
    onComponentConstructed() {
        super.onComponentConstructed();
        this.getStore('colors').data = this.generateData()
    }

    /**
     * @param {Object} data
     */
    onStopButtonClick(data) {
        this.intervalId && clearInterval(this.intervalId)
    }

    /**
     * @param {Object} data
     */
    onStartButtonClick(data) {
        this.intervalId = setInterval(() => {
            this.getStore('colors').data = this.generateData()
        }, 20);

        console.log(this.intervalId)
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
