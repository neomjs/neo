import ComponentController from '../../../src/controller/Component.mjs';
import NeoArray            from '../../../src/util/Array.mjs';

/**
 * @class SharedCovid.view.TableContainerController
 * @extends Neo.controller.Component
 */
class TableContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.TableContainerController'
         * @protected
         */
        className: 'SharedCovid.view.TableContainerController',
        /**
         * @member {String} apiBaseUrl='https://disease.sh/'
         */
        apiBaseUrl: 'https://disease.sh/',
        /**
         * @member {String} apiHistoricalDataEndpoint='v3/covid-19/historical'
         */
        apiHistoricalDataEndpoint: 'v3/covid-19/historical/',
        /**
         * Number of days you want the data to go back to. Default is 30. Use all for full data set. Ex: 15, all, 24
         * @member {Number|String} apiHistoricalDataTimeRange='all'
         */
        apiHistoricalDataTimeRange: 'all',
        /**
         * Remove all records with 0 cases from the historical data (table & chart)
         * @member {Boolean} removeEmptyRecords=true
         */
        removeEmptyRecords: true,
        /**
         * @member {Object} selectedRecord=null
         */
        selectedRecord: null,
        /**
         * @member {Neo.table.Container|null} table_=null
         * @protected
         */
        table_: null
    }

    /**
     * @param {Object} data
     */
    addStoreItems(data) {
        let me        = this,
            dataArray = [],
            map       = {},
            timeline  = data?.timeline,
            nextItem;

        // https://github.com/NovelCOVID/API/issues/309 // different format for 'all'
        if (data && !data.timeline) {
            timeline = data;
        }

        if (timeline) {
            Object.entries(timeline.cases || {}).forEach(([key, value]) => {
                if (key !== 'undefined') {
                    map[key] = {date: new Date(key).toISOString(), cases: value};
                }
            });

            Object.entries(timeline.deaths || {}).forEach(([key, value]) => {
                if (key !== 'undefined') {
                    if (map.hasOwnProperty(key)) {
                        map[key].deaths = value;
                    } else {
                        map[key] = {date: new Date(key).toISOString(), deaths: value};
                    }
                }
            });

            Object.entries(timeline.recovered || {}).forEach(([key, value]) => {
                if (key !== 'undefined') {
                    if (map.hasOwnProperty(key)) {
                        map[key].recovered = value;
                    } else {
                        map[key] = {date: new Date(key).toISOString(), recovered: value};
                    }
                }
            });

            Object.entries(map).forEach(([key, value]) => {
                value.active = value.cases - value.deaths - value.recovered;
                dataArray.push(value);
            });

            if (me.removeEmptyRecords) {
                [...dataArray].forEach(item => {
                    if (item.cases === 0) {
                        NeoArray.remove(dataArray, item);
                    }
                });
            }

            // the array is sorted by date ASC
            Object.assign(dataArray[0], {
                dailyActive   : dataArray[0].active,
                dailyCases    : dataArray[0].cases,
                dailyDeaths   : dataArray[0].deaths,
                dailyRecovered: dataArray[0].recovered
            });

            dataArray.forEach((item, index) => {
                nextItem = dataArray[index + 1];

                if (nextItem) {
                    Object.assign(nextItem, {
                        dailyActive   : nextItem.active    - item.active,
                        dailyCases    : nextItem.cases     - item.cases,
                        dailyDeaths   : nextItem.deaths    - item.deaths,
                        dailyRecovered: nextItem.recovered - item.recovered
                    });
                }
            });

            // todo: we could only update the active tab
            me.getReference('historical-data-table').store.data = dataArray;
            me.updateLineChart(dataArray);
        }
    }

    /**
     * @param {Object} record
     * @protected
     * @returns {Object}
     */
    static assignFieldsOrNull(record) {
        return {
            active        : record.active         || null,
            cases         : record.cases          || null,
            deaths        : record.deaths         || null,
            dailyActive   : record.dailyActive    || null,
            dailyCases    : record.dailyCases     || null,
            dailyDeaths   : record.dailyDeaths    || null,
            dailyRecovered: record.dailyRecovered || null,
            recovered     : record.recovered > 0 ? record.recovered : null
        };
    }

    /**
     * Triggered when accessing the table config
     * @param {Neo.table.Container|null} value
     * @protected
     */
    beforeGetTable(value) {
        if (!value) {
            this._table = value = this.getReference('table');
        }

        return value;
    }

    /**
     * @param {String} countryName
     */
    loadHistoricalData(countryName) {
        let me      = this,
            apiPath = me.apiBaseUrl + me.apiHistoricalDataEndpoint + countryName + '?lastdays=' + me.apiHistoricalDataTimeRange;

        fetch(apiPath)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + apiPath, err))
            .then(data => me.addStoreItems(data));
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
        let panel  = this.getReference('controls-panel'),
            expand = panel.width === 40;

        panel.width = expand ? this.component.historyPanelWidth : 40;

        data.component.text = expand ? 'X' : '+';
    }

    /**
     * {Object} record
     */
    onCountryChange(record) {
        let me = this;

        if (record) {
            me.selectedRecord = {...record};
        } else {
            me.selectedRecord = null;
        }

        // removed optional chaining for now, see: https://github.com/neomjs/neo/issues/467
        me.loadHistoricalData(record?.countryInfo?.iso2 || 'all');

        me.getReference('historical-data-label').html = 'Historical Data (' + (record?.country || 'World') + ')';
    }

    /**
     * {Object} data
     */
    onDailyValuesChange(data) {
        let chartId     = this.getReference('line-chart').id,
            logCheckbox = this.getReference('logarithmic-scale-checkbox'),
            value       = data.value;

        if (value) {
            logCheckbox.set({
                checked : false,
                disabled: data.value
            });
        } else {
            logCheckbox.disabled = false;
        }

        Neo.main.addon.AmCharts.setProperties({
            appName   : logCheckbox.appName,
            id        : chartId,
            properties: {
                'series.values.0.dataFields.valueY' : value ? 'dailyActive'    : 'active',
                'series.values.1.dataFields.valueY' : value ? 'dailyCases'     : 'cases',
                'series.values.2.dataFields.valueY' : value ? 'dailyDeaths'    : 'deaths',
                'series.values.3.dataFields.valueY' : value ? 'dailyRecovered' : 'recovered'
            }
        });

        Neo.main.addon.AmCharts.callMethod({
            appName: logCheckbox.appName,
            id     : chartId,
            path   : 'invalidateData'
        });
    }

    /**
     * {Object} data
     */
    onLogarithmicScaleChange(data) {
        let lineChart = this.getReference('line-chart');

        Neo.main.addon.AmCharts.setProperty({
            appName: lineChart.appName,
            id     : lineChart.id,
            path   : 'yAxes.values.0.logarithmic',
            value  : data.value
        });
    }

    /**
     *
     */
    storeReferences() {
        this.getReference('line-chart');
        this.getReference('logarithmic-scale-checkbox');
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

        dataArray.forEach(item => Object.assign(item, TableContainerController.assignFieldsOrNull(item)));

        if (!record) {
            record = me.getParent().summaryData;
        }

        if (record) {
            dataArray.push({
                date: new Date().toISOString(),
                ...TableContainerController.assignFieldsOrNull(record)
            });
        }

        chart.chartData = dataArray;
    }
}

export default Neo.setupClass(TableContainerController);
