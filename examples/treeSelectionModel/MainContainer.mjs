import ConfigurationViewport from '../ConfigurationViewport.mjs';

import Store         from '../../src/data/Store.mjs';
import NumberField   from '../../src/form/field/Number.mjs';
import AccordionTree from '../../src/tree/Accordion.mjs';
import CheckBox      from "../../src/form/field/CheckBox.mjs";

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
            minValue : 400,
            stepSize : 5,
            value    : treeList.height,
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1200,
            minValue : 200,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : treeList.width
        }];
    }

    /**
     * @returns {*}
     */
    createExampleComponent() {
        const store = Neo.create(Store, {
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
            }
        });

        return Neo.ntype({
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                //     module: TextField,
                //     label: 'Test',
                //     plugin: {
                //         Plugin: {
                //             bold: true
                //         }
                //     }
                // },{
                module: AccordionTree,
                store : store,
                height: 800,
                width : 400,

                // ensure afterSetMounted runs only once
                storeLoaded: false,
                afterSetMounted() {
                    if (!this.storeLoaded) {
                        this.storeLoaded = true;
                    } else {
                        return;
                    }

                    let me = this;

                    Neo.Xhr.promiseJson({
                        url: '../../examples/treeSelectionModel/tree.json'
                    }).then(data => {
                        const items      = data.json,
                              colorArray = ['red', 'yellow', 'green'],
                              iconArray  = ['home', 'industry', 'user'];

                        // create random iconCls colors
                        items.forEach((item) => {
                            if (!item.iconCls) {
                                const rand = Math.floor(Math.random() * 3);

                                item.iconCls = 'fa fa-' + iconArray[rand] + ' color-' + colorArray[rand];
                            }
                        });

                        me.store.data = data.json;
                        me.createItems(null, me.getListItemsRoot(), 0);
                    });
                }
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
