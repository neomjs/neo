import ComponentController from '../../../src/controller/Component.mjs';

/**
 * @class SharedCovid.view.WorldMapContainerController
 * @extends Neo.controller.Component
 */
class WorldMapContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.WorldMapContainerController'
         * @protected
         */
        className: 'SharedCovid.view.WorldMapContainerController',
        /**
         * @member {Number} heatRuleChangeDelay=150
         */
        heatRuleChangeDelay: 150,
        /**
         * @member {String|null} heatRuleChangeTimeout=null
         */
        heatRuleChangeTimeout: null
    }

    changeHeatRule(value) {
        let me         = this,
            {windowId} = me,
            chartId    = me.getReference('worldmap').id;

        Neo.main.addon.AmCharts.setProperty({
            id  : me.getReference('worldmap').id,
            path: 'series.values.0.heatRules.values.0.maxValue',
            value,
            windowId
        });

        Neo.main.addon.AmCharts.callMethod({
            id  : chartId,
            path: 'series.values.0.invalidateData',
            windowId
        })
    }

    /**
     * @param {Object} data
     */
    onHeatRuleFieldChange(data) {
        const me = this;

        clearTimeout(me.heatRuleChangeTimeout);

        me.heatRuleChangeTimeout = setTimeout(() => {
            me.changeHeatRule(data.value);
        }, me.heatRuleChangeDelay);
    }

    /**
     * @param {Object} data
     */
    onSeriesButtonClick(data) {
        let me          = this,
            {windowId}  = me,
            chartId     = me.getReference('worldmap').id,
            countryData = [...me.getParent().data],
            colorMap    = {
                active   : '#64b5f6',
                cases    : '#bbbbbb',
                deaths   : '#fb6767',
                recovered: '#28ca68'
            };

        Neo.main.addon.AmCharts.setProperty({
            id     : chartId,
            isColor: true,
            path   : 'series.values.0.heatRules.values.0.max',
            value  : colorMap[data.component.series],
            windowId
        });

        Neo.main.addon.AmCharts.setProperty({
            id   : chartId,
            path : 'series.values.0.dataFields.value',
            value: data.component.series,
            windowId
        });

        Neo.main.addon.AmCharts.callMethod({
            id  : chartId,
            path: 'series.values.0.invalidateData',
            windowId
        }).then(() => {
            me.getReference('currentMapViewLabel').text = 'Current view: ' + Neo.capitalize(data.component.series);

            countryData.sort((a, b) => b[data.component.series] - a[data.component.series]);

            me.getReference('heatRuleField').value = Math.ceil(countryData[9][data.component.series] / 100) * 100
        })
    }
}

export default Neo.setupClass(WorldMapContainerController);
