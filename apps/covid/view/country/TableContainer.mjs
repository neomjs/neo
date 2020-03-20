import CountryStore from '../../store/Countries.mjs';
import Container    from '../../../../src/table/Container.mjs';

/**
 * @class Covid.view.country.TableContainer
 * @extends Neo.table.Container
 */
class TableContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.country.TableContainer'
         * @private
         */
        className: 'Covid.view.country.TableContainer',
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
                return [
                    '<div style="display: flex; align-items: center">',
                        '<img style="height:20px; margin-right:10px; width:20px;" src="' + this.getCountryFlagUrl(value) + '">' + value,
                    '</div>'
                ].join('');
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

        me.getCountryFlagUrl = me.getController().getCountryFlagUrl.bind(me);
    }
}

Neo.applyClassConfig(TableContainer);

export {TableContainer as default};