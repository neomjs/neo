import Container    from '../../../../src/table/Container.mjs';
import CountryStore from '../../store/Countries.mjs';
import Util         from '../../Util.mjs';

/**
 * @class Covid.view.country.Table
 * @extends Neo.table.Container
 */
class Table extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.Table'
         * @private
         */
        className: 'Covid.view.country.Table',
        /**
         * @member {Array} cls=['covid-country-table', 'neo-table-container']
         */
        cls: ['covid-country-table', 'neo-table-container'],
        /**
         * Default configs for each column
         * @member {Object} columnDefaults=null
         */
        columnDefaults: {
            align   : 'right',
            renderer: Util.formatNumber
        },

        columns: [{
            align    : 'left',
            dataField: 'country',
            text     : 'Country',
            renderer : function(value) {
                return {
                    cls : ['neo-country-column', 'neo-table-cell'],
                    html: [
                        '<div style="display: flex; align-items: center">',
                            '<img style="height:20px; margin-right:10px; width:20px;" src="' + this.getCountryFlagUrl(value) + '">' + value,
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
            dataField: 'active',
            text     : 'Active'
        },  {
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : value => Util.formatNumber(value, 'green')
        }, {
            dataField: 'critical',
            text     : 'Critical',
            renderer : value => Util.formatNumber(value, 'orange')
        }, {
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : value => Util.formatNumber(value, 'red')
        }, {
            dataField: 'todayCases',
            text     : 'Cases today'
        }, {
            dataField: 'todayDeaths',
            text     : 'Deaths today',
            renderer : value => Util.formatNumber(value, 'red')
        }],
        /**
         * @member {Boolean} createRandomData=false
         */
        createRandomData: false, // testing config
        /**
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore
    }}

    constructor(config) {
        super(config);

        const me = this;

        // we do need a short delay to ensure that the maincontainer and its controller is constructed
        setTimeout(() => {
            me.getCountryFlagUrl = me.getController('maincontainer-controller').getCountryFlagUrl.bind(me);
        }, 20);
    }
}

Neo.applyClassConfig(Table);

export {Table as default};