import CountryGallery from './CountryGallery.mjs';
import Panel          from '../../../src/container/Panel.mjs';
import RangeField     from '../../../src/form/field/Range.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.coronaGallery.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.coronaGallery.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.coronaGallery.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['neo-gallery-maincontainer', 'neo-viewport']
         */
        cls: ['neo-gallery-maincontainer', 'neo-viewport'],
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
         * @member {Boolean} showGitHubStarButton=true
         */
        showGitHubStarButton: true,
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            style : {position: 'relative'},

            items : [{
                ntype: 'component',
                html : 'DeltaUpdates / s: <span id="neo-delta-updates"></span>',
                style: {
                    position: 'absolute',
                    right   : '150px',
                    top     : '25px',
                    width   : '200px',
                    zIndex  : 1
                }
            }, {
                ntype: 'component',
                html : '<a class="github-button" href="https://github.com/neomjs/neo" data-size="large" data-show-count="true" aria-label="Star neomjs/neo on GitHub">Star</a>',
                style: {
                    position: 'absolute',
                    right   : '20px',
                    top     : '20px',
                    zIndex  : 1
                }
            }]
        }, {
            ntype : 'panel',
            cls   : ['neo-controls-panel', 'neo-panel', 'neo-container'],
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {backgroundColor: '#2b2b2b'},
            width : 260,

            containerConfig: {
                style: {overflowY: 'scroll'}
            },

            headers: [{
                dock: 'top',
                items: [{
                    ntype: 'button',
                    text : 'X',
                    handler: function() {
                        const panel  = this.up('panel'),
                              expand = panel.width === 40;

                        panel.width = expand ? 250 : 40;
                        this.text   = expand ? 'X' : '+';
                    }
                }, {
                    ntype: 'label',
                    text : 'Gallery Controls'
                }]
            }],

            itemDefaults: {
                ntype        : 'rangefield',
                flex         : '0 1 auto',
                labelWidth   : '110px',
                style        : {padding: '10px'},
                useInputEvent: true,

                listeners: {
                    change: function(data) {
                        if (this.name === 'opacity') {
                            data.value /= 100;
                        }
                        Neo.get('neo-gallery-1')[this.name] = data.value;
                    }
                }
            },

            items: [{
                labelText: 'Translate X',
                maxValue : 5000,
                minValue : 0,
                name     : 'translateX',
                value    : 0,
                listeners: {
                    change: function(data) {
                        Neo.get('neo-gallery-1')[this.name] = data.value;
                    },
                    mounted: function(fieldId) {
                        let field = Neo.get(fieldId);

                        Neo.get('neo-gallery-1').on('changeTranslateX', function(value) {
                            value = Math.min(Math.max(value, this.minValue), this.maxValue);
                            this.value = value;
                        }, field);
                    }
                }
            }, {
                labelText: 'Translate Y',
                maxValue : 1500,
                minValue : -1500,
                name     : 'translateY',
                value    : 0
            }, {
                labelText: 'Translate Z',
                maxValue : 550,
                minValue : -4500,
                name     : 'translateZ',
                value    : 0,
                listeners: {
                    change: function(data) {
                        Neo.get('neo-gallery-1')[this.name] = data.value;
                    },
                    mounted: function(fieldId) {
                        let field = Neo.get(fieldId);

                        Neo.get('neo-gallery-1').on('changeTranslateZ', function(value) {
                            value = Math.min(Math.max(value, this.minValue), this.maxValue);
                            this.value = value;
                        }, field);
                    }
                }
            }, {
                labelText: 'Amount Rows',
                maxValue : 15,
                minValue : 1,
                name     : 'amountRows',
                value    : 3
            }, {
                ntype       : 'button',
                text        : 'Order by Row',
                listeners   : {},
                style       : {margin: '20px'},
                domListeners: {
                    click: function() {
                        const gallery    = Neo.get('neo-gallery-1'),
                              orderByRow = !gallery.orderByRow;

                        this.text = orderByRow === true ? 'Order By Column' : 'Order by Row';

                        gallery.orderByRow = orderByRow;
                    }
                }
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
                    items : [{
                        ntype    : 'button',
                        text     : 'Cases',
                        listeners: {},
                        style    : {margin: '10px', marginTop: '0'},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'cases',
                                    direction: 'DESC'
                                }];
                            }
                        }
                    }, {
                        ntype    : 'button',
                        text     : 'Deaths',
                        listeners: {},
                        style    : {margin: '10px', marginBottom: '10px', marginTop: 0},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'deaths',
                                    direction: 'DESC'
                                }];
                            }
                        }
                    }, {
                        ntype    : 'button',
                        text     : 'Country',
                        listeners: {},
                        style    : {margin: '10px', marginTop: 0},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'country',
                                    direction: 'ASC'
                                }];
                            }
                        }
                    }, {
                        ntype    : 'button',
                        text     : 'Recovered',
                        listeners: {},
                        style    : {margin: '10px', marginTop: 0},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'recovered',
                                    direction: 'ASC'
                                }];
                            }
                        }
                    }]
                }, {
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        ntype    : 'button',
                        text     : 'Cases today',
                        listeners: {},
                        style    : {margin: '10px', marginTop: '0'},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'todayCases',
                                    direction: 'DESC'
                                }];
                            }
                        }
                    }, {
                        ntype    : 'button',
                        text     : 'Deaths today',
                        listeners: {},
                        style    : {margin: '10px', marginBottom: '10px', marginTop: 0},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'todayDeaths',
                                    direction: 'DESC'
                                }];
                            }
                        }
                    }, {
                        ntype    : 'button',
                        text     : 'Critical',
                        listeners: {},
                        style: {margin: '10px', marginBottom: '43px', marginTop: 0},

                        domListeners: {
                            click: function() {
                                Neo.get('neo-gallery-1').store.sorters = [{
                                    property : 'critical',
                                    direction: 'DESC'
                                }];
                            }
                        }
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
                    '<p>Data provided by <a href="https://github.com/disease-sh/API">disease-sh/API</a>.</p>',
                    '<p>Country Flag Icons made by <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon"> www.flaticon.com</a>.</p>'
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me  = this,
            url = 'https://disease.sh/v3/covid-19/countries';

        me.gallery = Neo.create({
            module: CountryGallery,
            id    : 'neo-gallery-1',
            ...me.galleryConfig
        });

        me.items[0].items.unshift(me.gallery);

        fetch(url)
            .then(response => response.json())
            .catch(err => console.log('Can’t access ' + url, err))
            .then(data => me.addStoreItems(data));

        if (me.showGitHubStarButton) {
            me.on('mounted', () => {
                Neo.main.DomAccess.addScript({
                    async: true,
                    defer: true,
                    src  : 'https://buttons.github.io/buttons.js'
                });
            });
        }
    }

    /**
     * @param {Object[]} data
     */
    addStoreItems(data) {
        this.getStore().data = data;
    }

    /**
     * @returns {Neo.data.Store}
     */
    getStore() {
        return this.items[0].items[0].store;
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
