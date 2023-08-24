import ConfigurationViewport from '../ConfigurationViewport.mjs';

import AccordionTree  from '../../src/tree/Accordion.mjs';
import CheckBox       from "../../src/form/field/CheckBox.mjs";
import NumberField    from '../../src/form/field/Number.mjs';
import Panel          from '../../src/container/Panel.mjs';
import Store          from '../../src/data/Store.mjs';
import ViewController from '../../src/controller/Component.mjs';

/**
 * @class Neo.examples.treeSelectionModel.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.treeSelectionModel.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'},
        cls                 : ['examples-container-accordion']
    }

    onConfigChange(config, opts) {
        this.exampleComponent.items[0][config] = opts.value;
    }

    createConfigurationComponents() {
        let me       = this,
            treeList = me.exampleComponent.items[0];

        return [{
            module        : CheckBox,
            checked       : treeList.rootParentsAreCollapsible,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'rootParentsAreCollapsible')},
            valueLabelText: 'rootParentsAreCollapsible'
        }, {
            module        : CheckBox,
            checked       : treeList.firstParentIsVisible,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'firstParentIsVisible')},
            style         : {marginTop: '10px'},
            valueLabelText: 'firstParentIsVisible'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1200,
            minValue : 250,
            stepSize : 50,
            value    : 650,
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1200,
            minValue : 200,
            stepSize : 3,
            style    : {marginTop: '10px'},
            value    : 400
        }, {
            module: Panel,
            height: 150,
            width : '100%',

            itemDefaults: {
                style: {
                    padding: '10px'
                }
            },

            headers: [{
                dock : 'top',
                style: {borderRightColor: 'transparent'},

                items: [{
                    ntype: 'label',
                    text : 'Accordion Selection'
                }]
            }],

            items: [{
                ntype    : 'component',
                reference: 'output',
                vdom     : {
                    innerHTML: 'please select an item'
                }
            }]
        }];
    }

    /**
     * @returns {*}
     */
    createExampleComponent() {
        const me    = this,
              store = Neo.create(Store, {
                  keyProperty: 'id',
                  model      : {
                      fields: [
                          {name: 'collapsed', type: 'Boolean'},
                          {name: 'content', type: 'String'},
                          {name: 'iconCls', type: 'String'},
                          {name: 'id', type: 'Integer'},
                          {name: 'isLeaf', type: 'Boolean'},
                          {name: 'name', type: 'String'},
                          {name: 'parentId', type: 'Integer'}
                      ]
                  },

                  autoLoad: true,
                  url     : '../../examples/treeSelectionModel/tree.json'
              });

        return Neo.ntype({
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: AccordionTree,

                controller: {
                    module: ViewController,

                    onAccordionItemClick(record) {
                        let viewport = Neo.get('neo-configuration-viewport-1'),
                            outputEl = viewport.getReference('output');

                        outputEl.html = record.name;
                    }
                },

                store: store,

                listeners: {
                    leafItemClick: 'onAccordionItemClick'
                }
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
