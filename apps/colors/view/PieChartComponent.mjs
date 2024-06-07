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
                dataFields: {
                    value: 'litres',
                    category: 'country'
                }
            }],

            data: [{
                country: 'Lithuania',
                litres: 501.9
            }, {
                country: 'Czechia',
                litres: 301.9
            }, {
                country: 'Ireland',
                litres: 201.1
            }]
        }
    }
}

Neo.setupClass(PieChartComponent);

export default PieChartComponent;
