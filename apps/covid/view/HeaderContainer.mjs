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
         * @member {String[]} cls=['covid-header-container']
         */
        cls: ['covid-header-container'],
        /**
         * @member {Number} height=70
         */
        height: 120,
        /**
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Array} items
         */
        items: [{
            ntype    : 'component',
            minWidth : 267,
            reference: 'logo',
            style    : {margin: '10px'},
            width    : 267,

            vdom: {
                tag: 'img',
                src: 'https://raw.githubusercontent.com/neomjs/pages/master/resources/images/apps/covid/covid_logo_dark.jpg'
            }
        }, {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'container',
                layout: {ntype: 'hbox'},

                itemDefaults: {
                    ntype: 'component'
                },

                items : [{
                    module       : SelectField,
                    displayField : 'country',
                    flex         : 'none',
                    height       : 25,
                    labelPosition: 'inline',
                    labelText    : 'Select a Country',
                    minWidth     : 140,
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
                            {tag: 'tr', cn : [{tag: 'td', html: 'Active'},    {tag: 'td', cls: ['neo-align-right']}]},
                            {tag: 'tr', cn : [{tag: 'td', html: 'Recovered'}, {tag: 'td', cls: ['neo-align-right']}]},
                            {tag: 'tr', cn : [{tag: 'td', html: 'Deaths'},    {tag: 'td', cls: ['neo-align-right']}]}
                        ]
                    }
                }, {
                    flex: 1
                }, {
                    style: {padding: '10px'},
                    width: 110,
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
                }, {
                    style: {padding: '10px'},
                    width: 105,
                    vdom : {
                        cn: [{
                            tag              : 'a',
                            'aria-label'     : 'Sponsor @tobiu on GitHub',
                            cls              : ['github-button'],
                            'data-icon'      : 'octicon-heart',
                            'data-size'      : 'large',
                            href             : 'https://github.com/sponsors/tobiu',
                            html             : 'Sponsor'
                        }]
                    }
                }]
            }, {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    ntype : 'container',
                    layout: {ntype: 'hbox'},

                    itemDefaults: {
                        ntype: 'component',
                        cls  : ['covid-numberbox']
                    },

                    items: [{
                        style: {
                            borderColor: '#bbb'
                        },
                        vdom : {
                            cn: [
                                {html: 'Cases'},
                                {html: 1000, style:{color: '#bbb', textAlign:'right'}}
                            ]
                        }
                    }, {
                        style: {
                            borderColor: '#64b5f6'
                        },
                        vdom : {
                            cn: [
                                {html: 'Active'},
                                {html: 1000, style:{color: '#64b5f6', textAlign:'right'}}
                            ]
                        }
                    }, {
                        style: {
                            borderColor: 'green'
                        },
                        vdom : {
                            cn: [
                                {html: 'Recovered'},
                                {html: 1000, style:{color: 'green', textAlign:'right'}}
                            ]
                        }
                    }, {
                        style: {
                            borderColor: 'red'
                        },
                        vdom : {
                            cn: [
                                {html: 'Deaths'},
                                {html: 1000, style:{color: 'red', textAlign:'right'}}
                            ]
                        }
                    }]
                }]
            }]
        }]
    }}
}

Neo.applyClassConfig(HeaderContainer);

export {HeaderContainer as default};