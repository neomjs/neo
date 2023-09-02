import ConfigurationViewport from '../ConfigurationViewport.mjs';

import AccordionTree  from '../../src/tree/Accordion.mjs';
import CheckBox       from "../../src/form/field/CheckBox.mjs";
import NumberField    from '../../src/form/field/Number.mjs';
import Panel          from '../../src/container/Panel.mjs';
import Store          from '../../src/data/Store.mjs';
// Do not remove the ViewController nor ViewModel
import ViewController from '../../src/controller/Component.mjs';
import ViewModel      from '../../src/model/Component.mjs';

/**
 * @class Neo.examples.treeAccordion.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.treeAccordion.MainContainer',
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
            module        : CheckBox,
            checked       : treeList.showIcon,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'showIcon')},
            style         : {marginTop: '10px'},
            valueLabelText: 'showIcon'
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
                  url     : '../../examples/treeAccordion/tree.json'
              });

        return Neo.ntype({
            ntype: 'container',

            model: {
                data: {
                    selection: [{name: 'Please select something'}]
                }
            },

            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: AccordionTree,

                bind: {selection: {twoWay: true, value: data => data.selection}},

                store: store,

                /**
                 * We are using data-binding.
                 * Here is an example for listener and controller
                 */
                // controller: {
                //     module: ViewController,
                //
                //     onAccordionItemClick(record) {
                //         let viewport = Neo.get('neo-configuration-viewport-1'),
                //             outputEl = viewport.getReference('output');
                //
                //         outputEl.html = record.name;
                //     }
                // },
                //
                // listeners: {
                //     leafItemClick: 'onAccordionItemClick'
                // }

                listeners: {
                    selectPreFirstItem: () => Neo.log('listener selectPreFirstItem fired'),
                    selectPostLastItem: () => Neo.log('listener selectPostLastItem fired')
                }
            }, {
                module: Panel,
                height: 150,
                flex : 1,

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
                    bind     : {html: data => data.selection[0].name}
                }]
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
