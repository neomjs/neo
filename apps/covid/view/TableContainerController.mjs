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
        apiHistoricalDataEndpoint: 'historical/',
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

        // todo: remove, just for testing
        me.loadHistoricalData('Germany');
    }

    /**
     *
     * @param {Object[]} data
     */
    addStoreItems(data) {
        const timeline  = data && data.timeline,
              dataArray = [],
              map       = {};

        if (timeline) {
            Object.entries(timeline.cases).forEach(([key, value]) => {
                map[key] = {date1: key, cases: value};
            });

            Object.entries(timeline.deaths).forEach(([key, value]) => {
                if (map.hasOwnProperty(key)) {
                    map[key].deaths = value;
                } else {
                    map[key] = {date: key, deaths: value};
                }
            });

            Object.entries(timeline.deaths).forEach(([key, value]) => {
                if (map.hasOwnProperty(key)) {
                    map[key].recovered = value;
                } else {
                    map[key] = {date: key, recovered: value};
                }
            });

            Object.entries(map).forEach(([key, value]) => {
                dataArray.push(value);
            });

            console.log('### dataArray', dataArray);
            console.log(dataArray.length);
            console.log(this.getReference('historical-data-table'));
            this.getReference('historical-data-table').store.data = dataArray;
        }
    }

    /**
     * Triggered when accessing the table config
     * @param {Neo.table.Container|null} value
     * @private
     */
    beforeGetTabley(value) {
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
    onCollapseButtonClick(data) {
        const panel  = this.getReference('controls-panel'),
              expand = panel.width === 40;

        panel.width = expand ? 410 : 40;

        data.component.text = expand ? 'X' : '+';
    }
}

Neo.applyClassConfig(TableContainerController);

export {TableContainerController as default};