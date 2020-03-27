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
            console.log('mounted');

            Neo.main.DomAccess.createLineChart({
                // Create pie series
                "series": [{
                    "type": "PieSeries",
                    "dataFields": {
                        "value": "litres",
                        "category": "country"
                    }
                }],

                    // Add data
                    "data": [{
                    "country": "Lithuania",
                    "litres": 501.9
                }, {
                    "country": "Czech Republic",
                    "litres": 301.9
                }, {
                    "country": "Ireland",
                    "litres": 201.1
                }, {
                    "country": "Germany",
                    "litres": 165.8
                }, {
                    "country": "Australia",
                    "litres": 139.9
                }, {
                    "country": "Austria",
                    "litres": 128.3
                }, {
                    "country": "UK",
                    "litres": 99
                }, {
                    "country": "Belgium",
                    "litres": 60
                }, {
                    "country": "The Netherlands",
                    "litres": 50
                }],

                    // And, for a good measure, let's add a legend
                    "legend": {}

            });
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
