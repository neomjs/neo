import {default as Viewport} from '../../src/container/Viewport.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : 'fit',

        style: {
            padding: '50px'
        },

        items: [{
            ntype: 'component',
            id   : 'am-chart-1'
        }]
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        this.on('mounted', () => {
            Neo.main.DomAccess.createLineChart({
                id    : 'am-chart-1',
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

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
