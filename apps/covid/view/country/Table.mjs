import Container    from '../../../../src/table/Container.mjs';
import CountryStore from '../../store/Countries.mjs';
import Util         from '../../Util.mjs';

/**
 * @class Covid.view.country.Table
 * @extends Neo.table.Container
 */
class Table extends Container {
    static config = {
        /**
         * @member {String} className='Covid.view.country.Table'
         * @protected
         */
        className: 'Covid.view.country.Table',
        /**
         * @member {String[]} baseCls=['covid-country-table','neo-table-container']
         */
        baseCls: ['covid-country-table', 'neo-table-container'],
        /**
         * @member {Object} bind
         */
        bind: {
            country: {twoWay: true, value: data => data.country}
        },
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            align               : 'right',
            defaultSortDirection: 'DESC',
            renderer            : Util.formatNumber
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            cls      : ['neo-index-column', 'neo-table-header-button'],
            dataField: 'index',
            dock     : 'left',
            minWidth : 40,
            text     : '#',
            renderer : Util.indexRenderer,
            width    : 40
        }, {
            align               : 'left',
            dataField           : 'country',
            defaultSortDirection: 'ASC',
            dock                : 'left',
            text                : 'Country',
            width               : 200,

            renderer: data => {
                return {
                    cls : ['neo-country-column', 'neo-table-cell'],
                    html: [
                        '<div style="display: flex; align-items: center">',
                            '<img style="height:20px; margin-right:10px; width:20px;" src="' + Util.getCountryFlagUrl(data.value) + '">' + data.value,
                        '</div>'
                    ].join('')
                };
            }
        }, {
            dataField: 'cases',
            text     : 'Cases'
        }, {
            dataField: 'casesPerOneMillion',
            text     : 'Cases / 1M'
        }, {
            dataField: 'infected',
            text     : 'Infected',
            renderer : data => Util.formatInfected(data)
        }, {
            dataField: 'active',
            text     : 'Active',
            renderer : data => Util.formatNumber(data, '#64B5F6')
        },  {
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : data => Util.formatNumber(data, '#28ca68')
        }, {
            dataField: 'critical',
            text     : 'Critical',
            renderer : data => Util.formatNumber(data, 'orange')
        }, {
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }, {
            dataField: 'todayCases',
            text     : 'Cases today'
        }, {
            dataField: 'todayDeaths',
            text     : 'Deaths today',
            renderer : data => Util.formatNumber(data, '#fb6767')
        }, {
            dataField: 'tests',
            text     : 'Tests'
        }, {
            dataField: 'testsPerOneMillion',
            text     : 'Tests / 1M'
        }],
        /**
         * @member {String|null} country_=null
         */
        country_: null,
        /**
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore
    }

    /**
     * Triggered after the country config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountry(value, oldValue) {
        if (oldValue !== undefined) {
            let me             = this,
                selectionModel = me.selectionModel,
                view           = me.getView(),
                id;

            if (view) {
                if (value) {
                    id = `${view.id}__tr__${value}`; // the store can not be loaded on the first selection

                    if (!selectionModel.isSelected(id)) {
                        selectionModel.select(id);

                        me.mounted && Neo.main.DomAccess.scrollToTableRow({id: id});
                    }
                } else {
                    selectionModel.deselectAll();
                }
            }
        }
    }

    /**
     * Gets triggered from selection.Model: deselect()
     * @param {String[]} items
     */
    onDeselect(items) {
        this.country = null;
    }

    /**
     * Gets triggered from selection.Model: select()
     * @param {String[]} items
     */
    onSelect(items) {
        let me   = this,
            item = items[0] || null;

        if (me.store.getCount() > 0) {
            if (item) {
                item = me.getView().getRecordByRowId(item)?.country;
            }

            // in case getRecordByRowId() has no match, the initial row creation will include the selection
            if (item) {
                me.country = item;
            }
        }
    }
}

Neo.applyClassConfig(Table);

export default Table;
