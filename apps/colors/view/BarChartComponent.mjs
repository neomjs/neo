import AmChartComponent from '../../../src/component/wrapper/AmChart.mjs';

/**
 * @class Colors.view.BarChartComponent
 * @extends Neo.component.wrapper.AmChart
 */
class BarChartComponent extends AmChartComponent {
    static config = {
        /**
         * @member {String} className='Colors.view.BarChartComponent'
         * @protected
         */
        className: 'Colors.view.BarChartComponent',
        /**
         * @member {String[]} baseCls=['colors-bar-chart']
         */
        baseCls: ['colors-bar-chart'],
        /**
         * @member {String} chartType='PieChart'
         */
        chartType: 'XYChart',
        /**
         * @member {Object} _vdom
         */
        /**
         * @member {Object} chartConfig
         */
        chartConfig: {
            series: [{
                type: 'ColumnSeries',

                columns: {
                    propertyFields: {
                        fill  : 'color',
                        stroke: 'color'
                    }
                },

                dataFields: {
                    categoryX: 'color',
                    valueY   : 'count'
                }
            }],
            xAxes: [{
                type: 'CategoryAxis',

                dataFields: {
                    category: 'color',
                    title: {
                        text: 'Colors'
                    }
                }
            }],
            yAxes: [{
                type: 'ValueAxis',

                title: {
                    text: 'Occurrences in table cells'
                }
            }]
        }
    }
}

Neo.setupClass(BarChartComponent);

export default BarChartComponent;
