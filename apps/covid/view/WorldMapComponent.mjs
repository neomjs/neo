import {default as AmChartComponent} from '../../../src/component/wrapper/AmChart.mjs';

/**
 * @class Covid.view.country.WorldMapComponent
 * @extends Neo.component.wrapper.AmChart
 */
class WorldMapComponent extends AmChartComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.WorldMapComponent'
         * @private
         */
        className: 'Covid.view.country.WorldMapComponent',
        /**
         * @member {String[]} cls=['covid-line-chart']
         */
        cls: ['covid-world-map'],
        /**
         * @member {Object} chartConfig
         */
        chartConfig: {
            cursor: {}, // default value for each chart type

            "columns": {
                "tooltipText": "Series: {name}\nCategory: {categoryX}\nValue: {valueY}",
                "fill": "#104547"
            },

            xAxes: [{
                type: 'DateAxis',

                renderer: {
                    minGridDistance: 60,
                    labels: {
                        template: {
                            fill: '#bbb'
                        }
                    }
                }
            }],

            yAxes: [{
                type       : 'ValueAxis',
                logarithmic: true,

                numberFormatter: {
                    numberFormat: '#a',

                    bigNumberPrefixes: [
                        {number: 1e3, suffix: 'K'},
                        {number: 1e6, suffix: 'M'},
                        {number: 1e9, suffix: 'B'}
                    ]
                },
                renderer: {
                    minGridDistance: 60,
                    labels: {
                        template: {
                            fill: '#bbb'
                        }
                    }
                }
            }],

            series: [{
                type       : 'LineSeries',
                dataFields : {dateX : 'date', valueY: 'cases'},
                fill       : '#64b5f6',
                name       : 'Cases',
                stroke     : '#64b5f6',
                strokeWidth: 3,
                tooltipText: '{name}: [bold]{valueY}[/]'
            }, {
                type       : 'LineSeries',
                dataFields : {dateX : 'date', valueY: 'deaths'},
                fill       : '#e86c6c',
                name       : 'Deaths',
                stroke     : '#e86c6c',
                strokeWidth: 3,
                tooltipText: '{name}: [bold]{valueY}[/]'
            }]
        }
    }}
}

Neo.applyClassConfig(WorldMapComponent);

export {WorldMapComponent as default};