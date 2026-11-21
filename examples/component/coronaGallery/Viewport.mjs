import BaseViewport       from '../../../src/container/Viewport.mjs';
import BoxLabel           from '../../../src/component/BoxLabel.mjs';
import CountryGallery     from './CountryGallery.mjs';
import Panel              from '../../../src/container/Panel.mjs';
import RangeField         from '../../../src/form/field/Range.mjs';
import ThemeSwitcher      from '../../../src/button/ThemeSwitcher.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.coronaGallery.Viewport
 * @extends Neo.container.Viewport
 * @summary 3D country indicators gallery viewport with live theme-able controls panel.
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.Viewport'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.Viewport',
        /**
         * @member {String[]} baseCls=['neo-gallery-viewport','neo-viewport']
         */
        baseCls: ['neo-gallery-viewport', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Neo.component.Gallery|null} gallery=null
         */
        gallery: null,
        /**
         * @member {Object|null} galleryConfig=null
         */
        galleryConfig: null,
        /**
         * @member {Object|null} layout={ntype: 'hbox', align: 'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            style : {position: 'relative'}
        }, {
            module   : Panel,
            cls      : ['neo-controls-panel', 'neo-panel', 'neo-container'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'controls-panel',
            width    : 260,

            containerConfig: {
                style: {overflowY: 'scroll'}
            },

            headers: [{
                dock  : 'top',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : [{
                    ntype  : 'button',
                    text   : 'X',
                    handler: function() {
                        const panel  = this.up('panel'),
                              expand = panel.width === 40;

                        panel.width = expand ? 250 : 40;
                        this.text   = expand ? 'X' : '+';
                    }
                }, {
                    ntype: 'label',
                    text : 'Gallery Controls'
                }, '->', {
                    module  : ThemeSwitcher,
                    showText: false
                }]
            }],

            itemDefaults: {
                flex         : 'none',
                labelPosition: 'top',
                style        : {padding: '10px'},
                useInputEvent: true
            },

            items: [{
                module   : RangeField,
                labelText: 'Translate X',
                maxValue : 5000,
                minValue : 0,
                name     : 'translateX',
                value    : 0,
                listeners: {
                    change : 'onRangefieldChange',
                    mounted: 'onRangefieldMounted'
                }
            }, {
                module   : RangeField,
                labelText: 'Translate Y',
                maxValue : 1500,
                minValue : -1500,
                name     : 'translateY',
                value    : 0,
                listeners: {
                    change: 'onRangefieldChange'
                }
            }, {
                module   : RangeField,
                labelText: 'Translate Z',
                maxValue : 550,
                minValue : -4500,
                name     : 'translateZ',
                value    : 0,
                listeners: {
                    change : 'onRangefieldChange',
                    mounted: 'onRangefieldMounted'
                }
            }, {
                module   : RangeField,
                labelText: 'Amount Rows',
                maxValue : 15,
                minValue : 1,
                name     : 'amountRows',
                value    : 3,
                listeners: {
                    change: 'onRangefieldChange'
                }
            }, {
                ntype  : 'button',
                handler: 'onOrderButtonClick',
                text   : 'Order by Row',
                style  : {margin: '20px'}
            }, {
                ntype: 'label',
                text : 'Sort By:'
            }, {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'},
                style : {minHeight: '134px', padding: '0'},

                items : [{
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},

                    itemDefaults: {
                        ntype  : 'button',
                        handler: 'onSortButtonClick'
                    },

                    items: [{
                        field: 'population',
                        text : 'Population',
                        style: {margin: '10px', marginTop: '0'}
                    }, {
                        field: 'gdp',
                        text : 'GDP',
                        style: {margin: '10px', marginTop: 0}
                    }, {
                        field: 'country',
                        text : 'Country',
                        style: {margin: '10px', marginTop: 0}
                    }]
                }, {
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},

                    itemDefaults: {
                        ntype  : 'button',
                        handler: 'onSortButtonClick'
                    },

                    items: [{
                        field: 'gdpPerCapita',
                        text : 'Per head',
                        style: {margin: '10px', marginTop: '0'}
                    }, {
                        field: 'lifeExpectancy',
                        text : 'Life',
                        style: {margin: '10px', marginTop: 0}
                    }, {
                        field: 'internet',
                        text : 'Internet',
                        style: {margin: '10px', marginTop: 0}
                    }]
                }]
            }, {
                module: BoxLabel,
                html  : [
                    '<b>Navigation Concept</b>',
                    '<p>You can use the Arrow Keys to walk through the items.</p>'
                ].join('')
            }, {
                module: BoxLabel,
                cls   : ['neo-link-color'],
                html  : [
                    '<b>Attribution</b>',
                    '<p>Data: <a href="https://data.worldbank.org">World Bank, World Development Indicators</a>, CC BY 4.0, retrieved 17 Nov 2026.</p>',
                    '<p>Flags: <a href="https://github.com/HatScripts/circle-flags">circle-flags</a>, MIT.</p>'
                ].join('')
            }]
        }]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.gallery = Neo.create({
            module   : CountryGallery,
            appName  : me.appName,
            parentId : me.id,
            reference: 'gallery',
            ...me.galleryConfig
        });

        me.items[0].items = [me.gallery]
    }

    /**
     * @returns {Neo.data.Store}
     */
    getStore() {
        return this.items[0].items[0].store
    }
}

export default Neo.setupClass(Viewport);
