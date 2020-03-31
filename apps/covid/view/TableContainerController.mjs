import {default as ComponentController} from '../../../src/controller/Component.mjs';

/**
 * @class Covid.view.TableContainerController
 * @extends Neo.controller.Component
 */
class TableContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.TableContainerController'
         * @private
         */
        className: 'Covid.view.TableContainerController',
        /**
         * @member {String} apiBaseUrl='https://corona.lmao.ninja/'
         */
        apiBaseUrl: 'https://corona.lmao.ninja/',
        /**
         * @member {String} apiHistoricalDataEndpoint='historical'
         */
        apiHistoricalDataEndpoint: 'v2/historical/',
        /**
         * @member {Object} selectedRecord=null
         */
        selectedRecord: null,
        /**
         * @member {Neo.table.Container|null} table_=null
         * @private
         */
        table_: null
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.view.on('countrySelect', me.onTableSelect, me);
    }

    /**
     *
     * @param {Object} data
     */
    addStoreItems(data) {
        const me        = this,
              dataArray = [],
              map       = {};

        let timeline  = data && data.timeline;

        // https://github.com/NovelCOVID/API/issues/309 // different format for 'all'
        if (data && !data.timeline) {
            timeline = data;
        }

        if (timeline) {
            Object.entries(timeline.cases).forEach(([key, value]) => {
                map[key] = {date: new Date(key).toISOString(), cases: value};
            });

            Object.entries(timeline.deaths).forEach(([key, value]) => {
                if (map.hasOwnProperty(key)) {
                    map[key].deaths = value;
                } else {
                    map[key] = {date: new Date(key).toISOString(), deaths: value};
                }
            });

            if (timeline.hasOwnProperty('recovered')) {
                Object.entries(timeline.recovered).forEach(([key, value]) => {
                    if (map.hasOwnProperty(key)) {
                        map[key].recovered = value;
                    } else {
                        map[key] = {date: new Date(key).toISOString(), recovered: value};
                    }
                });
            }

            Object.entries(map).forEach(([key, value]) => {
                value.active = value.cases - value.deaths - value.recovered;
                dataArray.push(value);
            });

            // todo: we could only update the active tab
            me.getReference('historical-data-table').store.data = dataArray;
            me.updateLineChart(dataArray);
        }
    }

    /**
     * Triggered when accessing the table config
     * @param {Neo.table.Container|null} value
     * @private
     */
    beforeGetTable(value) {
        if (!value) {
            this._table = value = this.getReference('table');
        }

        return value;
    }

    /**
     *
     * @param {String} countryName
     */
    loadHistoricalData(countryName) {
        const me      = this,
              apiPath = me.apiBaseUrl + me.apiHistoricalDataEndpoint + countryName;

        fetch(apiPath)
            .then(response => response.json())
            .then(data => me.addStoreItems(data))
            .catch(err => console.log('Can’t access ' + apiPath, err));
    }

    /**
     * {Object} data
     */
    on520pxButtonClick(data) {
        this.getReference('controls-panel').width = 520;
    }

    /**
     * {Object} data
     */
    on800pxButtonClick(data) {
        this.getReference('controls-panel').width = 800;
    }

    /**
     * {Object} data
     */
    onCollapseButtonClick(data) {
        const panel  = this.getReference('controls-panel'),
              expand = panel.width === 40;

        panel.width = expand ? this.view.historyPanelWidth : 40;

        data.component.text = expand ? 'X' : '+';
    }

    /**
     * {Object} data
     */
    onLogarithmicScaleChange(data) {
        Neo.main.AmCharts.toggleLogarithmic({
            id   : this.getReference('line-chart').id,
            value: data.value
        });
    }

    /**
     * {Object} data
     * {Object} data.record
     */
    onTableSelect(data) {
        const me      = this,
              record  = data.record;

        let country = record && record.country;

        if (data.record) {
            me.selectedRecord = {...record};
        } else {
            me.selectedRecord = null;
            country = 'all'
        }

        me.loadHistoricalData(country);

        if (country === 'all') {
            country = 'World';
        }

        me.getReference('historical-data-label').html = 'Historical Data (' + country + ')';
    }

    /**
     * Logarithmic Axis break for values of 0, so we need to change those to null
     * Adding the current record, since the historical data starts "yesterday"
     * @param {Object[]} dataArray
     */
    updateLineChart(dataArray) {
        let me     = this,
            record = me.selectedRecord,
            chart  = me.getReference('line-chart');

        dataArray.forEach(item => {
            item.active    = item.active    || null;
            item.cases     = item.cases     || null;
            item.deaths    = item.deaths    || null;
            item.recovered = item.recovered || null;
        });

        if (!record) {
            record = me.getParent().summaryData;
        }

        if (record) {
            dataArray.push({
                date: new Date().getTime(),

                active   : record.active    || null,
                cases    : record.cases     || null,
                deaths   : record.deaths    || null,
                recovered: record.recovered || null
            });
        }

        Neo.main.AmCharts.updateData({
            data    : dataArray,
            dataPath: chart.dataPath,
            id      : chart.id
        });
    }
}

Neo.applyClassConfig(TableContainerController);

export {TableContainerController as default};