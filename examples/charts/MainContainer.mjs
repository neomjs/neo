import AmChartComponent from '../../src/component/wrapper/AmChart.mjs';
import Component        from '../../src/component/Base.mjs';
import Container        from '../../src/container/Base.mjs';
import ThemeSwitcher    from '../../src/button/ThemeSwitcher.mjs';
import Toolbar          from '../../src/toolbar/Base.mjs';
import Viewport         from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.charts.MainContainer
 * @extends Neo.container.Viewport
 * @summary amCharts pie chart demonstration with live theme switching.
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.charts.MainContainer',
        layout   : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module: Toolbar,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            style : {borderBottom: '1px solid color-mix(in srgb, currentColor 12%, transparent)', padding: '10px 24px'},
            items : [{
                module: Component,
                html  : '<strong>amCharts Pie</strong>'
            }, '->', {
                module: ThemeSwitcher,
                ui    : 'secondary'
            }]
        }, {
            module: Container,
            flex  : 1,
            layout: 'fit',
            style : {padding: '24px 50px 50px'},

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
        }]
    }
}

export default Neo.setupClass(MainContainer);
