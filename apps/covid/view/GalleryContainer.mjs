import Gallery                    from './country/Gallery.mjs';
import GalleryContainerController from './GalleryContainerController.mjs';
import {default as Panel}         from '../../../src/container/Panel.mjs';
import {default as RangeField}    from '../../../src/form/field/Range.mjs';
import {default as Container}     from '../../../src/container/Viewport.mjs';
import {default as VDomUtil} from "src/util/VDom";
import ComponentManager from "src/manager/Component";

/**
 * @class Covid.view.GalleryContainer
 * @extends Neo.container.Base
 */
class GalleryContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.GalleryContainer'
         * @private
         */
        className: 'Covid.view.GalleryContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['neo-gallery-maincontainer', 'neo-viewport']
         */
        cls: ['neo-gallery-maincontainer', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component|null} controller=GalleryContainerController
         */
        controller: GalleryContainerController,
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
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]|null} items
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            items : []
        }, {
            module   : Panel,
            cls      : ['neo-controls-panel', 'neo-panel', 'neo-container'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'controls-panel',
            style    : {backgroundColor: '#2b2b2b'},
            width    : 260,

            itemDefaults: {
                flex         : '0 1 auto',
                labelWidth   : '110px',
                style        : {padding: '10px'},
                useInputEvent: true
            },

            headers: [{
                dock: 'top',
                items: [{
                    ntype    : 'button',
                    handler  : 'onCollapseButtonClick',
                    reference: 'collapse-button',
                    text     : 'X'
                }, {
                    ntype: 'label',
                    text : 'Gallery Controls'
                }]
            }],

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
                style : {padding: '0'},
                items : [{
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        ntype  : 'button',
                        field  : 'cases',
                        handler: 'onSortButtonClick',
                        text   : 'Cases',
                        style  : {margin: '10px', marginTop: '0'}
                    }, {
                        ntype  : 'button',
                        field  : 'deaths',
                        handler: 'onSortButtonClick',
                        text   : 'Deaths',
                        style  : {margin: '10px', marginBottom: '10px', marginTop: 0}
                    }, {
                        ntype  : 'button',
                        field  : 'country',
                        handler: 'onSortButtonClick',
                        text   : 'Country',
                        style  : {margin: '10px', marginTop: 0}
                    }]
                }, {
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        ntype  : 'button',
                        field  : 'todayCases',
                        handler: 'onSortButtonClick',
                        text   : 'Cases today',
                        style  : {margin: '10px', marginTop: '0'}
                    }, {
                        ntype  : 'button',
                        field  : 'todayDeaths',
                        handler: 'onSortButtonClick',
                        text   : 'Deaths today',
                        style  : {margin: '10px', marginBottom: '10px', marginTop: 0}
                    }, {
                        ntype  : 'button',
                        field  : 'critical',
                        handler: 'onSortButtonClick',
                        text   : 'Critical',
                        style  : {margin: '10px', marginTop: 0}
                    }]
                }]
            }, {
                ntype: 'label',
                text : [
                    '<b>Navigation Concept</b>',
                    '<p>You can use the Arrow Keys to walk through the items.</p>'
                ].join(''),

                style: {
                    backgroundColor: '#323232',
                    color          : '#ddd',
                    fontSize       : '13px',
                    margin         : '10px',
                    padding        : '10px',
                    whiteSpace     : 'normal'
                }
            }, {
                ntype: 'label',
                cls  : ['neo-link-color'],
                text : [
                    '<b>Attribution</b>',
                    '<p>App created with <a href="https://github.com/neomjs/neo">neo.mjs</a>.</p>',
                    '<p>Data provided by <a href="https://github.com/NovelCOVID/API">NovelCOVID/API</a>.</p>',
                    '<p>Icons made by <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon"> www.flaticon.com</a>.</p>'
                ].join(''),

                style: {
                    backgroundColor: '#323232',
                    color          : '#ddd',
                    fontSize       : '13px',
                    margin         : '10px',
                    padding        : '10px',
                    whiteSpace     : 'normal'
                }
            }]
        }]
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        const me = this;

        me.gallery = Neo.create({
            module   : Gallery,
            reference: 'gallery',
            ...me.galleryConfig || {}
        });

        me.items[0].items.push(me.gallery);
    }

    /**
     *
     */
    destroy(...args) {
        this.gallery = null;
        super.destroy(...args);
    }
}

Neo.applyClassConfig(GalleryContainer);

export {GalleryContainer as default};