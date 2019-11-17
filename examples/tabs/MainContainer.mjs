import {default as TabContainer}   from '../../src/tab/Container.mjs';
import {default as NumberField}    from '../../src/form/field/Number.mjs';
import {default as PasswordField}  from '../../src/form/field/Password.mjs';
import {default as TextField}      from '../../src/form/field/Text.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.tab.Container
 */
class MainContainer extends TabContainer {
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

        items: [
            {
                ntype: 'container',

                itemDefaults: {
                    ntype     : 'textfield',
                    flex      : '0 1 auto',
                    labelWidth: '120px'
                },

                layout: {
                    ntype: 'vbox'
                },

                items: [
                    {
                        id       : 'firstNameField',
                        labelText: 'First Name'
                    },
                    {
                        labelText: 'Last Name'
                    },
                    {
                        ntype    : 'numberfield',
                        labelText: 'Number | 10-20',
                        maxValue : 20,
                        minValue : 10,
                        value    : 10
                    },
                    {
                        ntype    : 'passwordfield',
                        labelText: 'Password'
                    },
                    {
                        ntype: 'component',
                        flex : 1
                    },
                    {
                        ntype : 'toolbar',
                        layout: {
                            ntype: 'hbox'
                        },
                        itemDefaults: {
                            ntype: 'button',
                            style: {
                                margin: '0 10px 0 0'
                            }
                        },
                        items: [
                            {
                                text: 'Change Label Text',
                                domListeners: {
                                    click: {
                                        fn: function () {
                                            let field = Neo.getComponent('firstNameField');

                                            field.labelText = 'New Label' + Math.round(Math.random() * 100);
                                        }
                                    }
                                }
                            },
                            {
                                text: 'Change Label Color',
                                domListeners: {
                                    click: {
                                        fn: function () {
                                            let field = Neo.getComponent('firstNameField'),
                                                label = field.getLabelEl(),
                                                style = label.style,
                                                vdom  = field.vdom;

                                            if (!style) {
                                                style = {};
                                            }

                                            if (style.color && style.color === 'red') {
                                                delete style.color;
                                            } else {
                                                style.color = 'red';
                                            }

                                            label.style = style;
                                            field.vdom = vdom;
                                        }
                                    }
                                }
                            },
                            {
                                text: 'Move Fields',
                                domListeners: {
                                    click: {
                                        fn: function () {
                                            let field  = Neo.getComponent('firstNameField'),
                                                parent = Neo.getComponent(field.parentId),
                                                vdom   = parent.vdom,
                                                cn     = vdom.cn,
                                                tmp    = cn[1];

                                            cn[1] = cn[3];
                                            cn[3] = tmp;

                                            cn[1].cn[0].style.color = 'steelblue';
                                            cn[3].cn[0].style.color = 'green';

                                            parent.vdom = vdom;
                                        }
                                    }
                                }
                            },
                            {
                                iconCls: 'fa fa-plus',
                                text   : 'Insert Textfield',
                                domListeners: {
                                    click: {
                                        fn: function () {
                                            let button = Neo.getComponent('firstNameField'),
                                                parent = Neo.getComponent(button.parentId);

                                            // global variable for testing
                                            if (!this.fieldCount) {
                                                this.fieldCount = 0;
                                            }

                                            this.fieldCount++;

                                            parent.insert(4, {
                                                labelText: 'Dynamic Field ' + this.fieldCount
                                            });
                                        }
                                    }
                                }
                            },
                            {
                                iconCls: 'fa fa-minus',
                                text   : 'Remove Textfield',
                                style: {
                                    margin: 0
                                },
                                domListeners: {
                                    click: {
                                        fn: function (data) {
                                            let button    = Neo.getComponent(data.target.id),
                                                container = button.up('container');

                                            if (container.items[4].ntype === 'textfield') {
                                                container.removeAt(4);
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                ],

                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                }
            },
            {
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                },
                vdom: {
                    innerHTML: 'Test 2'
                }
            },
            {
                tabButtonConfig: {
                    iconCls: 'fa fa-user',
                    text   : 'Tab 3'
                },
                vdom: {
                    innerHTML: 'Test 3'
                }
            }
        ]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
