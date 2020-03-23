import CountryStore from '../../store/Countries.mjs';
import Container    from '../../../../src/table/Container.mjs';

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
         * @member {Boolean} createRandomData=false
         */
        createRandomData: false, // testing config
        /**
         * @member {Neo.data.Store} store=CountryStore
         */
        store: CountryStore,

        columns: [{
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
            align    : 'right',
            dataField: 'cases',
            text     : 'Cases'
        }, {
            align    : 'right',
            dataField: 'deaths',
            text     : 'Deaths',
            renderer : function(value) {
                return `<span style="color:red;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'critical',
            text     : 'Critical',
            renderer : function(value) {
                return `<span style="color:orange;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'recovered',
            text     : 'Recovered',
            renderer : function(value) {
                return `<span style="color:green;">${value}</span>`;
            }
        }, {
            align    : 'right',
            dataField: 'todayCases',
            text     : 'Cases today'
        }, {
            align    : 'right',
            dataField: 'todayDeaths',
            text     : 'Deaths today',
            renderer : function(value) {
                return `<span style="color:red;">${value}</span>`;
            }
        }]
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