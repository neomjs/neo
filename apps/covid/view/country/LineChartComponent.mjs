import {default as AmChartComponent} from '../../../../src/component/wrapper/AmChart.mjs';

/**
 * @class Covid.view.country.LineChartComponent
 * @extends Neo.component.wrapper.AmChart
 */
class LineChartComponent extends AmChartComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.LineChartComponent'
         * @private
         */
        className: 'Covid.view.country.LineChartComponent',
        /**
         * @member {String[]} cls=['covid-line-chart']
         */
        cls: ['covid-line-chart'],
        /**
         * @member {Object} chartConfig
         */
        chartConfig: {
            cursor: {
                maxTooltipDistance: -1
            },

            legend: {
                labels: {
                    template: {
                        fill: '#bbb'
                    }
                }
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
                    numberFormat: '#.0a',

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
                dataFields : {dateX : 'date', valueY: 'active'},
                fill       : '#64b5f6',
                name       : 'Active',
                stroke     : '#64b5f6',
                strokeWidth: 3,

                tooltip: {
                    background       : {fill: '#fff'},
                    getFillFromObject: false,
                    label            : {fill: '#000'}
                }
            }, {
                type       : 'LineSeries',
                dataFields : {dateX : 'date', valueY: 'cases'},
                fill       : '#bbb',
                name       : 'Cases',
                stroke     : '#bbb',
                strokeWidth: 3,

                tooltip: {
                    background       : {fill: '#fff'},
                    getFillFromObject: false,
                    label            : {fill: '#000'}
                }
            }, {
                type       : 'LineSeries',
                dataFields : {dateX : 'date', valueY: 'deaths'},
                fill       : '#fb6767',
                name       : 'Deaths',
                stroke     : '#fb6767',
                strokeWidth: 3,

                tooltip: {
                    background       : {fill: '#fff'},
                    getFillFromObject: false,
                    label            : {fill: '#000'}
                }
            }, {
                type       : 'LineSeries',
                dataFields : {dateX : 'date', valueY: 'recovered'},
                fill       : '#28ca68',
                name       : 'Recovered',
                stroke     : '#28ca68',
                strokeWidth: 3,

                tooltip: {
                    background       : {fill: '#fff'},
                    getFillFromObject: false,
                    label            : {fill: '#000'}
                }
            }]
        },
        /**
         * @member {Boolean} combineSeriesTooltip=true
         */
        combineSeriesTooltip: true,
        /**
         * @member {Boolean} fitParentHeight=true
         */
        fitParentHeight: true
    }}
}

Neo.applyClassConfig(LineChartComponent);

export {LineChartComponent as default};