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
         * @member {String} chartType='MapChart'
         */
        chartType: 'MapChart',
        /**
         * @member {String} package='am4maps'
         */
        package: 'am4maps',
        /**
         * @member {Object} chartConfig
         */
        chartConfig: {
            projection: 'Miller',
            geodata   : 'worldLow',

            series: [{
                type      : 'MapPolygonSeries',
                exclude   : ['AQ'],
                useGeodata: true,

                mapPolygons: {
                    tooltipText: '{name}: [bold]{value}[/]',
                    fill       : '#74B266',

                    states: {
                        hover: {
                            properties: {
                                fill: '#367B25'
                            }
                        }
                    }
                },

                data: [{
                    id   : 'US',
                    name : 'United States',
                    value: 100
                }, {
                    id   : 'FR',
                    name : 'France',
                    value: 50
                }]
            }]
        }
    }}
}

Neo.applyClassConfig(WorldMapComponent);

export {WorldMapComponent as default};