import AmChartComponent from '../../src/component/wrapper/AmChart.mjs';
import Viewport         from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.charts.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.charts.MainContainer',
        layout   : 'fit',

        style: {
            padding: '50px'
        },

        items: [{
            module     : AmChartComponent,
            chartType  : 'PieChart',
            chartConfig: {
                legend: {},

                series: [{
                    type: "PieSeries",

                    dataFields: {
                        value   : "litres",
                        category: "country"
                    }
                }],

                data: [{
                    country: "Lithuania",
                    litres : 501.9
                }, {
                    country: "Czech Republic",
                    litres : 301.9
                }, {
                    country: "Ireland",
                    litres : 201.1
                }, {
                    country: "Germany",
                    litres : 165.8
                }, {
                    country: "Australia",
                    litres : 139.9
                }, {
                    country: "Austria",
                    litres : 128.3
                }, {
                    country: "UK",
                    litres : 99
                }, {
                    country: "Belgium",
                    litres : 60
                }, {
                    country: "The Netherlands",
                    litres : 50
                }]
            }
        }]
    }
}

export default Neo.setupClass(MainContainer);
