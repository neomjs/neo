import Button    from '../../src/button/Base.mjs';
import Container from '../../src/tab/Container.mjs';
import * as form from '../../src/form/_export.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.tab.Container
 */
class MainContainer extends Container {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        activeIndex: 0,
        autoMount  : true,
        height     : 500,

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        itemDefaults: {
            ntype: 'component',
            style: {
                padding: '10px'
            }
        },

        style: {
            margin: '20px'
        },

        items: [
            {
                ntype: 'container',

                itemDefaults: {
                    flex      : '0 1 auto',
                    labelWidth: '70px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        ntype    : 'pickerfield',
                        id       : 'myPickerfield',
                        labelText: 'Picker',
                        width    : 220
                    },
                    {
                        module : Button,
                        iconCls: 'fa fa-minus',
                        style  : {marginTop: '20px'},
                        text   : 'Remove Triggers',
                        width  : 120,
                        handler: function() {
                            let field = Neo.getComponent('myPickerfield');
                            field.triggers = [];
                        }
                    },
                    {
                        module : Button,
                        iconCls: 'fa fa-plus',
                        text   : 'Add Trigger',
                        width  : 120,
                        handler: function() {
                            let field         = Neo.getComponent('myPickerfield'),
                                fieldTriggers = field.triggers || [],
                                triggers      = [...fieldTriggers]; // ensure to clone the array to not edit the internal oldValue by reference

                            triggers.push({
                                id     : Neo.getId('picker'),
                                cls    : 'fa fa-caret-down',
                                handler: 'onPickerTriggerClick'
                            });

                            field.triggers = triggers;
                        }
                    }
                ],

                tabButtonConfig: {
                    iconCls: 'fas fa-list',
                    text   : 'Picker'
                }
            },
            {
                ntype: 'container',

                itemDefaults: {
                    flex      : '0 1 auto',
                    labelWidth: '70px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        ntype    : 'checkboxfield',
                        checked  : true,
                        labelText: 'Option 1',
                        name     : 'group1'
                    },
                    {
                        ntype    : 'checkboxfield',
                        labelText: 'Option 2',
                        name     : 'group1'
                    },
                    {
                        ntype    : 'checkboxfield',
                        labelText: 'Option 3',
                        name     : 'group1'
                    },
                    {
                        ntype         : 'checkboxfield',
                        checked       : true,
                        hideValueLabel: false,
                        labelText     : 'Group 2',
                        name          : 'group2',
                        style         : {marginTop: '20px'},
                        valueLabelText: 'Option 1'
                    },
                    {
                        ntype         : 'checkboxfield',
                        hideValueLabel: false,
                        labelText     : '',
                        name          : 'group2',
                        valueLabelText: 'Option 2'
                    },
                    {
                        ntype         : 'checkboxfield',
                        hideValueLabel: false,
                        labelText     : '',
                        name          : 'group2',
                        valueLabelText: 'Option 3'
                    }
                ],

                tabButtonConfig: {
                    iconCls: 'fas fa-check-square',
                    text   : 'CheckBox'
                }
            },
            {
                ntype: 'container',

                itemDefaults: {
                    flex      : '0 1 auto',
                    labelWidth: '70px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        ntype    : 'radiofield',
                        checked  : true,
                        labelText: 'Option 1',
                        name     : 'group1'
                    },
                    {
                        ntype    : 'radiofield',
                        labelText: 'Option 2',
                        name     : 'group1'
                    },
                    {
                        ntype    : 'radiofield',
                        labelText: 'Option 3',
                        name     : 'group1'
                    },
                    {
                        ntype         : 'radiofield',
                        checked       : true,
                        hideValueLabel: false,
                        labelText     : 'Group 2',
                        name          : 'group2',
                        style         : {marginTop: '20px'},
                        valueLabelText: 'Option 1'
                    },
                    {
                        ntype         : 'radiofield',
                        hideValueLabel: false,
                        labelText     : '',
                        name          : 'group2',
                        valueLabelText: 'Option 2'
                    },
                    {
                        ntype         : 'radiofield',
                        hideValueLabel: false,
                        labelText     : '',
                        name          : 'group2',
                        valueLabelText: 'Option 3'
                    }
                ],

                tabButtonConfig: {
                    iconCls: 'far fa-circle',
                    text   : 'Radio'
                }
            },
            {
                ntype: 'container',

                itemDefaults: {
                    flex      : '0 1 auto',
                    labelWidth: '120px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        ntype    : 'rangefield',
                        labelText: '0-20, Step 1',
                        maxValue : 20,
                        minValue : 0,
                        value    : 10
                    },
                    {
                        ntype    : 'rangefield',
                        labelText: '0-20, Step 5',
                        maxValue : 20,
                        minValue : 0,
                        stepSize : 5,
                        value    : 10
                    }
                ],

                tabButtonConfig: {
                    iconCls: 'fa fa-exchange-alt',
                    text   : 'Range'
                }
            },
            {
                ntype: 'container',

                itemDefaults: {
                    flex      : '0 1 auto',
                    labelWidth: '120px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        ntype    : 'numberfield',
                        labelText: '0-20, Step 1',
                        maxValue : 20,
                        minValue : 0,
                        value    : 10
                    },
                    {
                        ntype    : 'numberfield',
                        labelText: '0-20, Step 5',
                        maxValue : 20,
                        minValue : 0,
                        stepSize : 5,
                        value    : 10
                    }
                ],
                tabButtonConfig: {
                    iconCls: 'fa fa-sort-numeric-up',
                    text   : 'Number'
                }
            },
            {
                tabButtonConfig: {
                    iconCls: 'fa fa-calendar',
                    text   : 'Date'
                },
                vdom: {
                    innerHTML: 'todo'
                }
            }
        ]
    }}
}



Neo.applyClassConfig(MainContainer);

export {MainContainer as default};