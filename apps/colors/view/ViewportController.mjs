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
                id     : `row${i + 1}`,
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

        let me   = this,
            data = me.generateData();

        me.getStore('colors').data = data;
        me.updatePieChart(data)
    }

    /**
     * @param {Object} data
     */
    onStopButtonClick(data) {
        let me = this;

        if (me.intervalId) {
            clearInterval(me.intervalId);
            me.intervalId = null
        }
    }

    /**
     * @param {Object} data
     */
    onStartButtonClick(data) {
        let me           = this,
            intervalTime = 1000 / 60, // assuming 60 FPS
            store        = me.getStore('colors'),
            table        = me.getReference('table'),
            tableView    = table.view;

        if (!me.intervalId) {
            me.intervalId = setInterval(() => {
                let data = me.generateData();

                tableView.silentVdomUpdate = true;

                store.items.forEach((record, index) => {
                    record.set(data[index])
                });

                tableView.silentVdomUpdate = false;

                tableView.update();

                me.updatePieChart(data)
            }, intervalTime);
        }
    }

    /**
     * @param {Object} data
     */
    updatePieChart(data) {
        let startCharCode = 'A'.charCodeAt(0),
            colorSummary  = {
            colorA: 0,
            colorB: 0,
            colorC: 0,
            colorD: 0,
            colorE: 0
        };

        data.forEach(item => {
            Object.entries(item).forEach(([key, value]) => {
                if (key !== 'id') {
                    colorSummary['color' + String.fromCharCode(startCharCode + value - 1)]++
                }
            })
        });

        this.getReference('pie-chart').chartData = [
            {color: 'A', count: colorSummary['colorA']},
            {color: 'B', count: colorSummary['colorB']},
            {color: 'C', count: colorSummary['colorC']},
            {color: 'D', count: colorSummary['colorD']},
            {color: 'E', count: colorSummary['colorE']}
        ]
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
