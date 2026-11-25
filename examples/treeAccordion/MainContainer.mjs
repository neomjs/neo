import AccordionTree         from '../../src/tree/Accordion.mjs';
import CheckBox              from '../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import NumberField           from '../../src/form/field/Number.mjs';
import Panel                 from '../../src/container/Panel.mjs';
import SettingsStore         from './SettingsStore.mjs';
import StateProvider         from '../../src/state/Provider.mjs';

/**
 * @summary A tree accordion as an app's settings navigation, headed by the setting it selects. The selection is bound
 * two ways to the viewport's state provider, which the panel reads; on a phone the panel stays at the stage's top.
 * @class Neo.examples.treeAccordion.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.treeAccordion.MainContainer'
         * @protected
         */
        className: 'Neo.examples.treeAccordion.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} cls=['examples-container-accordion']
         * @reactive
         */
        cls: ['examples-container-accordion'],
        /**
         * @member {String} componentName='Tree accordion'
         */
        componentName: 'Tree accordion',
        /**
         * @member {Number} configItemLabelWidth=100
         */
        configItemLabelWidth: 100,
        /**
         * @member {Number} configItemWidth=230
         */
        configItemWidth: 230,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object} stateProvider
         */
        stateProvider: {
            module: StateProvider,
            data  : {selection: null}
        }
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me        = this,
            accordion = me.exampleComponent;

        return [{
            module        : CheckBox,
            checked       : accordion.rootParentsAreCollapsible,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'rootParentsAreCollapsible')},
            valueLabel    : 'rootParentsAreCollapsible'
        }, {
            module        : CheckBox,
            checked       : accordion.firstParentIsVisible,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'firstParentIsVisible')},
            style         : {marginTop: '10px'},
            valueLabel    : 'firstParentIsVisible'
        }, {
            module        : CheckBox,
            checked       : accordion.showIcon,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'showIcon')},
            style         : {marginTop: '10px'},
            valueLabel    : 'showIcon'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1200,
            minValue : 250,
            stepSize : 10,
            value    : accordion.height,
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1200,
            minValue : 200,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : accordion.width
        }]
    }

    /**
     * @summary Returns the `Neo.tree.Accordion` config bound two-way to the viewport's `selection` state.
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module                   : AccordionTree,
            bind                     : {selection: {key: 'selection', twoWay: true}},
            height                   : 270,
            rootParentsAreCollapsible: true,
            store                    : SettingsStore,
            width                    : 320,
            listeners                : {
                // The settings open on Profile, the tree's item ids being the ones it renders
                mounted: function() {
                    this.selectionModel.select(this.getItemId('profile'))
                }
            }
        }
    }

    /**
     * @summary The panel naming the selected setting, bound to the same state as the accordion's selection.
     * @returns {Object[]}
     */
    createStageItems() {
        return [{
            module: Panel,
            cls   : ['tree-settings-selection'],
            width : 320,

            headers: [{
                dock : 'top',
                items: [{ntype: 'label', text: 'Selected setting'}]
            }],

            items: [{
                ntype: 'label',
                cls  : ['tree-settings-selection-name'],
                bind : {text: data => data.selection?.[0]?.name || 'None yet: pick a setting'}
            }, {
                ntype: 'label',
                cls  : ['tree-settings-selection-content'],
                bind : {text: data => data.selection?.[0]?.content || ''}
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
