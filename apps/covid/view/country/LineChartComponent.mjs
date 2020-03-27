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
                    xAxes: [{
                        type: 'DateAxis',
                        renderer: {
                            minGridDistance: 50
                        }
                    }],

                    yAxes: [{
                        type: 'ValueAxis'
                    }],

                    series: [{
                        name       : 'Units',
                        stroke     : '#CDA2AB',
                        type       : 'LineSeries',
                        strokeWidth: 3,

                        dataFields : {
                            valueX: 'date',
                            valueY: 'cases'
                        }
                    }]
                }
            });
        });
    }
}

Neo.applyClassConfig(LineChartComponent);

export {LineChartComponent as default};