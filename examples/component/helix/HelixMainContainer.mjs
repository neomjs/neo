import {default as Helix}       from '../../../src/component/Helix.mjs';
import {default as NumberField} from '../../../src/form/field/Number.mjs';
import {default as Panel}       from '../../../src/container/Panel.mjs';
import {default as RangeField}  from '../../../src/form/field/Range.mjs';
import {default as Viewport}    from '../../../src/container/Viewport.mjs';

/**
 * @class TestApp.HelixMainContainer
 * @extends Neo.container.Viewport
 */
class HelixMainContainer extends Viewport {
    static getConfig() {return {
        className: 'TestApp.HelixMainContainer',
        ntype    : 'main-container',

        autoMount: true,
        /**
         * @member {Object|null} helixConfig=null
         */
        helixConfig: null,
        layout   : {ntype: 'hbox', align: 'stretch'},

        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            items : []
        }, {
            ntype : 'panel',
            layout: {ntype: 'vbox',align: 'stretch'},
            style : {backgroundColor: '#2b2b2b'},
            width : 250,

            containerConfig: {
                flex : null,
                style: {overflowY: 'scroll'}
            },

            itemDefaults: {
                ntype        : 'rangefield',
                flex         : '0 1 auto',
                labelWidth   : '100px',
                style        : {padding: '10px'},
                useInputEvent: true,

                listeners: {
                    change: function(data) {
                        if (['deltaY', 'maxOpacity', 'minOpacity'].includes(this.name)) {
                            data.value /= 100;
                        }
                        Neo.get('neo-helix-1')[this.name] = data.value;
                    }
                }
            },

            headers: [{
                dock: 'top',
                text: 'Helix Controls'
            }],

            items: [{
                labelText: 'Translate X',
                maxValue : 2000,
                minValue : -2000,
                name     : 'translateX',
                value    : 400
            }, {
                labelText: 'Translate Y',
                maxValue : 2500,
                minValue : -2500,
                name     : 'translateY',
                value    : -350
            }, {
                labelText: 'Translate Z',
                maxValue : 4500,
                minValue : -4500,
                name     : 'translateZ',
                value    : -1500,
                listeners: {
                    change: function(data) {
                        Neo.get('neo-helix-1')[this.name] = data.value;
                    },
                    mounted: function(fieldId) {
                        let field = Neo.get(fieldId);

                        Neo.get('neo-helix-1').on('changeTranslateZ', function(value) {
                            value = Math.min(Math.max(value, this.minValue), this.maxValue);
                            this.value = value;
                        }, field);
                    }
                }
            }, {
                labelText : 'Delta Y',
                labelAlign: 'top',
                maxValue  : 600,
                minValue  : -600,
                name      : 'deltaY',
                value     : 70
            }, {
                labelText: 'Rotate',
                minValue : -720,
                maxValue : 720,
                name     : 'rotationAngle',
                value    : 0,
                listeners: {
                    change: function(data) {
                        Neo.get('neo-helix-1')[this.name] = data.value;
                    },
                    mounted: function(fieldId) {
                        let field = Neo.get(fieldId);

                        Neo.get('neo-helix-1').on('changeRotation', function(value) {
                            value = Math.min(Math.max(value, this.minValue), this.maxValue);
                            this.value = value;
                        }, field);
                    }
                }
            }, {
                labelText: 'Radius',
                maxValue : 3500,
                minValue : 900,
                name     : 'radius',
                value    : 1500
            }, {
                labelText: 'Perspective',
                minValue : 50,
                maxValue : 3000,
                name     : 'perspective',
                value    : 800
            }, {
                labelText: 'Item Angle',
                minValue : 1,
                maxValue : 36,
                name     : 'itemAngle',
                value    : 8
            }, {
                labelText: 'Max Opacity',
                name     : 'maxOpacity',
                minValue : 0,
                maxValue : 100,
                value    : 80 // todo [30, 80]
            }, {
                labelText: 'Min Opacity',
                name     : 'minOpacity',
                minValue : 0,
                maxValue : 100,
                value    : 30
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
                ntype     : 'button',
                disabled  : true, // component.Helix: buffered sorting #105
                text      : 'Sort by Lastname',
                listeners: {},
                domListeners: {
                    click: data => {
                        Neo.get('neo-helix-1').store.sorters = [{
                            property : 'lastname',
                            direction: 'ASC'
                        }, {
                            property : 'firstname',
                            direction: 'ASC'
                        }];
                    }
                },
                style: {
                    margin      : '20px',
                    marginBottom: '10px'
                }
            }, {
                ntype     : 'button',
                disabled  : true, // component.Helix: buffered sorting #105
                text      : 'Sort by Firstname',
                listeners: {},
                domListeners: {
                    click: data => {
                        Neo.get('neo-helix-1').store.sorters = [{
                            property : 'firstname',
                            direction: 'ASC'
                        }, {
                            property : 'lastname',
                            direction: 'ASC'
                        }];
                    }
                },
                style: {
                    margin   : '20px',
                    marginTop: 0
                }
            }, {
                ntype    : 'button',
                iconCls  : 'fa fa-square',
                text     : 'Follow Selection',
                listeners: {},
                domListeners: {
                    click: function(data) {
                        let me   = this,
                            helix = Neo.get('neo-helix-1');

                        if (me.iconCls === 'fa fa-square') {
                            helix.followSelection = true;
                            me.iconCls = 'fa fa-check-square';
                        } else {
                            helix.followSelection = false;
                            me.iconCls = 'fa fa-square';
                        }
                    }
                },
                style: {
                    margin      : '20px',
                    marginBottom: '10px'
                }
            }, {
                ntype: 'label',
                text : [
                    '<b>Navigation Concept</b>',
                    '<p>Click on an item to select it. Afterwards you can use the Arrow Keys to walk through the contacts.</p>',
                    '<p>Hit the Space Key to rotate the currently selected contact to the front.</p>',
                    '<p>Hit the Enter Key to expand the currently selected contact.</p>'
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

        this.items[0].items.push({
            module: Helix,
            id    : 'neo-helix-1',
            ...this.helixConfig || {}
        });
    }
}

Neo.applyClassConfig(HelixMainContainer);

export {HelixMainContainer as default};