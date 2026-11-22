import Gallery       from '../../../src/component/Gallery.mjs';
import ImageStore    from './ImageStore.mjs';
import NumberField   from '../../../src/form/field/Number.mjs';
import Panel         from '../../../src/container/Panel.mjs';
import RangeField    from '../../../src/form/field/Range.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.gallery.MainContainer
 * @extends Neo.container.Viewport
 * @summary 3D image gallery demonstration with live theme-able controls panel.
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.component.gallery.MainContainer',
        /**
         * @member {Neo.component.Gallery|null} gallery=null
         */
        gallery: null,
        /**
         * @member {Object|null} galleryConfig=null
         */
        galleryConfig: null,
        /**
         * @member {Object} layout
         */
        layout: {ntype: 'hbox', align: 'stretch'},
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
                    color   : '#f8fafc',
                    position: 'absolute',
                    right   : '20px',
                    top     : '25px',
                    width   : '200px',
                    zIndex  : 1
                }
            }]
        }, {
            ntype : 'panel',
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {maxWidth: '50%'},
            width : 260,

            containerConfig: {
                flex : null,
                style: {overflowY: 'auto'}
            },

            itemDefaults: {
                ntype        : 'rangefield',
                flex         : 'none',
                labelPosition: 'top',
                style        : {padding: '10px'},
                useInputEvent: true,

                listeners: {
                    change: function(data) {
                        if (this.name === 'opacity') {
                            data.value /= 100;
                        }
                        Neo.get('neo-gallery-1')[this.name] = data.value
                    }
                }
            },

            headers: [{
                dock  : 'top',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : [{
                    ntype: 'label',
                    cls  : ['neo-panel-header-text', 'neo-label'],
                    text : 'Gallery Controls'
                }, '->', {
                    module  : ThemeSwitcher,
                    showText: false
                }]
            }],

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
                            this.value = value
                        }, field)
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
                        Neo.get('neo-gallery-1')[this.name] = data.value
                    },
                    mounted: function(fieldId) {
                        let field = Neo.get(fieldId);

                        Neo.get('neo-gallery-1').on('changeTranslateZ', function(value) {
                            value = Math.min(Math.max(value, this.minValue), this.maxValue);
                            this.value = value
                        }, field)
                    }
                }
            }, {
                labelText: 'Amount Rows',
                maxValue : 15,
                minValue : 1,
                name     : 'amountRows',
                value    : 3
            }, {
                module   : NumberField,
                clearable: false,
                labelText: 'Max Items',
                maxValue : 600,
                minValue : 100,
                name     : 'maxItems',
                stepSize : 100,
                value    : 300
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

                        gallery.orderByRow = orderByRow
                    }
                }
            }, {
                ntype    : 'button',
                disabled : true,
                text     : 'Sort by Lastname',
                listeners: {},
                style    : {margin: '20px', marginBottom: '10px'},

                domListeners: {
                    click: function() {
                        Neo.get('neo-gallery-1').store.sorters = [{
                            property : 'lastname',
                            direction: 'ASC'
                        }, {
                            property : 'firstname',
                            direction: 'ASC'
                        }]
                    }
                }
            }, {
                ntype    : 'button',
                disabled : true,
                text     : 'Sort by Firstname',
                listeners: {},
                style    : {margin: '20px', marginTop: 0},

                domListeners: {
                    click: function() {
                        Neo.get('neo-gallery-1').store.sorters = [{
                            property : 'firstname',
                            direction: 'ASC'
                        }, {
                            property : 'lastname',
                            direction: 'ASC'
                        }]
                    }
                }
            }, {
                ntype: 'label',
                html : [
                    '<b>Navigation Concept</b>',
                    '<p>Click on an item to select it. Afterwards you can use the Arrow Keys to walk through the items.</p>'
                ].join(''),

                style: {
                    border      : '1px solid var(--panel-border-color, rgba(128, 128, 128, 0.3))',
                    borderRadius: '6px',
                    fontSize    : '13px',
                    margin      : '10px',
                    padding     : '10px',
                    whiteSpace  : 'normal'
                }
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
            module: Gallery,
            id    : 'neo-gallery-1',
            store : ImageStore,
            ...me.galleryConfig
        });

        me.items[0].items.unshift(me.gallery)
    }

    /**
     * @returns {Neo.data.Store}
     */
    getStore() {
        return this.items[0].items[0].store
    }
}

export default Neo.setupClass(MainContainer);
