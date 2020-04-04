import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.WorldMapContainerController
 * @extends Neo.controller.Component
 */
class WorldMapContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.WorldMapContainerController'
         * @private
         */
        className: 'Covid.view.WorldMapContainerController'
    }}

    /**
     *
     * @param {Object} data
     */
    onSeriesButtonClick(data) {
        const chartId = this.getReference('worldmap').id;

        const colorMap = {
            active   : '#64b5f6',
            cases    : '#bbbbbb',
            deaths   : '#fb6767',
            recovered: '#28ca68'
        };

        Neo.main.AmCharts.setProperty({
            id     : chartId,
            isColor: true,
            path   : 'series.values.0.heatRules.values.0.max',
            value  : colorMap[data.component.series]
        });

        Neo.main.AmCharts.setProperty({
            id   : chartId,
            path : 'series.values.0.dataFields.value',
            value: data.component.series
        });

        Neo.main.AmCharts.callMethod({
            id  : chartId,
            path: 'series.values.0.invalidateData'
        });
    }
}

Neo.applyClassConfig(WorldMapContainerController);

export {WorldMapContainerController as default};