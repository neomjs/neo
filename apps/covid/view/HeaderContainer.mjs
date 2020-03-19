import {default as Container}   from '../../../src/container/Base.mjs';
import CountryStore             from '../store/Countries.mjs';
import {default as SelectField} from '../../../src/form/field/Select.mjs';

/**
 * @class Covid.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.HeaderContainer'
         * @private
         */
        className: 'Covid.view.HeaderContainer',
        /**
         * @member {Number} height=70
         */
        height: 70,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox'},
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component'
        },
        /**
         * @member {Array} items
         */
        items: [{
            html : 'COVID-19 neo.mjs App',
            style: {padding: '20px'},
            width: 210
        }, {
            module       : SelectField,
            displayField : 'country',
            flex         : 'none',
            height       : 25,
            labelPosition: 'inline',
            labelText    : 'Select a Country',
            reference    : 'country-field',
            style        : {marginTop: '15px'},
            width        : 200,

            listeners: {
                select: 'onCountryFieldSelect'
            },

            store: {
                module : CountryStore,
                sorters: [{
                    property : 'country',
                    direction: 'ASC'
                }]
            }
        }, {
            ntype  : 'button',
            flex   : 'none',
            handler: 'onSwitchThemeButtonClick',
            height : 25,
            iconCls: 'fa fa-sun',
            style  : {marginLeft: '10px', marginTop: '15px'},
            text   : 'Theme Light'
        }, {
            ntype  : 'button',
            flex   : 'none',
            handler: 'onReloadDataButtonClick',
            height : 25,
            iconCls: 'fa fa-sync-alt',
            style  : {marginLeft: '10px', marginTop: '15px'},
            text   : 'Reload Data'
        }, {
            reference: 'summary-table',
            style: {
                fontSize  : '13px',
                margin    : '10px',
                marginLeft:'20px'
            },
            vdom: {
                tag: 'table',
                cn : [
                    {tag: 'tr', cn : [{tag: 'td', html: 'Cases'},     {tag: 'td', cls: ['neo-align-right']}]},
                    {tag: 'tr', cn : [{tag: 'td', html: 'Deaths'},    {tag: 'td', cls: ['neo-align-right', 'neo-content-deaths']}]},
                    {tag: 'tr', cn : [{tag: 'td', html: 'Recovered'}, {tag: 'td', cls: ['neo-align-right', 'neo-content-recovered']}]}
                ]
            }
        }, {
            flex: 1
        }, {
            style: {padding: '10px'},
            width: 130,
            vdom : {
                cn: [{
                    tag              : 'a',
                    'aria-label'     : 'Star neomjs/neo on GitHub',
                    cls              : ['github-button'],
                    'data-show-count': 'true',
                    'data-size'      : 'large',
                    href             : 'https://github.com/neomjs/neo',
                    html             : 'Star'
                }]
            }
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};