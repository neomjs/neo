import {default as Component} from '../../../../src/component/Base.mjs';

/**
 * @class Covid.view.country.LineChartComponent
 * @extends Neo.component.Base
 */
class LineChartComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.LineChartComponent'
         * @private
         */
        className: 'Covid.view.country.LineChartComponent',
        /**
         * @member {String[]} cls=['covid-line-chart']
         */
        cls: ['covid-line-chart']
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);


        this.on('mounted', () => {
            Neo.main.DomAccess.createChart({
                id  : this.id,
                type: 'XYChart',

                config: {
                    cursor: {}, // default value for each chart type

                    xAxes: [{
                        type: 'DateAxis',
                        dateFormatter: {
                            dateFormat: 'MMMM-dd'
                        },
                        renderer: {
                            minGridDistance: 50,
                            labels: {
                                template: {
                                    fill: '#bbb'
                                }
                            }
                        }
                    }],

                    yAxes: [{
                        type: 'ValueAxis',

                        numberFormatter: {
                            numberFormat: '#a',

                            bigNumberPrefixes: [
                                {number: 1e3, suffix: 'K'},
                                {number: 1e6, suffix: 'M'},
                                {number: 1e9, suffix: 'B'}
                            ]
                        },
                        renderer: {
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
                        name       : 'Cases',
                        stroke     : '#64b5f6',
                        strokeWidth: 3
                    }, {
                        type       : 'LineSeries',
                        dataFields : {dateX : 'date', valueY: 'deaths'},
                        name       : 'Cases',
                        stroke     : '#ff5b5b',
                        strokeWidth: 3
                    }]
                }
            });
        });
    }
}

Neo.applyClassConfig(LineChartComponent);

export {LineChartComponent as default};