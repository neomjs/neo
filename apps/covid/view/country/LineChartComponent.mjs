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
        className: 'Covid.view.country.LineChartComponent'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);


        this.on('mounted', () => {
            Neo.main.DomAccess.createLineChart({
                id    : this.id,
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
            });
        });
    }
}

Neo.applyClassConfig(LineChartComponent);

export {LineChartComponent as default};