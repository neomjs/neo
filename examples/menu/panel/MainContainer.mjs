import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Menu                  from '../../../src/menu/Panel.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.menu.panel.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.menu.panel.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 800,
            minValue  : 30,
            stepSize  : 5,
            value     : me.exampleComponent.height,
            style     : {marginTop: '10px'}
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'subMenuGap',
            listeners : {change: me.onConfigChange.bind(me, 'subMenuGap')},
            maxValue  : 20,
            minValue  : 0,
            stepSize  : 1,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.subMenuGap
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 800,
            minValue  : 100,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Menu,

            listConfig: {
                displayField: 'name'
            },

            listItems: [{
                iconCls: 'fa fa-user',
                id     : 1,
                name   : 'Item 1'
            }, {
                iconCls: 'fa fa-home',
                id     : 2,
                name   : 'Group 1',
                items  : [{
                    iconCls: 'fa fa-home',
                    id     : 6,
                    name   : 'Item 1'
                }, {
                    iconCls: 'fa fa-home',
                    id     : 7,
                    name   : 'Item 2'
                }, {
                    iconCls: 'fa fa-home',
                    id     : 8,
                    name   : 'Item 3'
                }]
            }, {
                iconCls: 'fa fa-cog',
                id     : 3,
                name   : 'Item 2'
            }, {
                iconCls: 'far fa-calendar',
                id     : 4,
                name   : 'Item 3'
            }, {
                iconCls: 'far fa-clock',
                id     : 5,
                name   : 'Group 2',
                items  : [{
                    iconCls: 'fa fa-clock',
                    id     : 9,
                    name   : 'Item 1'
                }, {
                    iconCls: 'fa fa-clock',
                    id     : 10,
                    name   : 'Item 2'
                }, {
                    iconCls: 'fa fa-clock',
                    id     : 11,
                    name   : 'Group 1',
                    items  : [{
                        iconCls: 'far fa-clock',
                        id     : 12,
                        name   : 'Item 1'
                    }, {
                        iconCls: 'far fa-clock',
                        id     : 13,
                        name   : 'Item 2'
                    }, {
                        iconCls: 'far fa-clock',
                        id     : 14,
                        name   : 'Item 3'
                    }]
                }]
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
