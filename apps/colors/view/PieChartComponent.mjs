import AmChartComponent from '../../../src/component/wrapper/AmChart.mjs';

/**
 * @class Colors.view.PieChartComponent
 * @extends Neo.component.wrapper.AmChart
 */
class PieChartComponent extends AmChartComponent {
    static config = {
        /**
         * @member {String} className='Colors.view.PieChartComponent'
         * @protected
         */
        className: 'Colors.view.PieChartComponent',
        /**
         * @member {String[]} baseCls=['colors-pie-chart']
         */
        baseCls: ['colors-pie-chart'],
        /**
         * @member {String} chartType='PieChart'
         */
        chartType: 'PieChart',
        /**
         * @member {Object} _vdom
         */
        /**
         * @member {Object} chartConfig
         */
        chartConfig: {
            series: [{
                type: 'PieSeries',

                colors: {
                    list: [
                        '#1c60a0',
                        '#206db6',
                        '#247acb',
                        '#2e87da',
                        '#4493de',
                        '#59a0e2',
                        '#6face6',
                        '#85b9ea',
                        '#9bc5ed',
                        '#b0d2f1'
                    ]
                },

                dataFields: {
                    category: 'color',
                    value   : 'count'
                }
            }]
        }
    }
}

Neo.setupClass(PieChartComponent);

export default PieChartComponent;
