import ApiTreeList           from '../../docs/app/view/ApiTreeList.mjs';
import CheckBox              from '../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import NumberField           from '../../src/form/field/Number.mjs';
import Panel                 from '../../src/container/Panel.mjs';

/**
 * @class Neo.examples.tree.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.tree.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me       = this,
            treeList = me.exampleComponent.items[0];

        return [{
            module        : CheckBox,
            checked       : treeList.disableSelection,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'disableSelection')},
            valueLabelText: 'disableSelection'
        }, {
            module        : CheckBox,
            checked       : treeList.draggable,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'draggable')},
            style         : {marginTop: '10px'},
            valueLabelText: 'draggable'
        }, {
            module        : CheckBox,
            checked       : treeList.dragZone?.leafNodesOnly || false,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onLeafNodesOnlyChange.bind(me)},
            style         : {marginTop: '10px'},
            valueLabelText: 'DragZone.leafNodesOnly'
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
            module        : CheckBox,
            checked       : treeList.sortable,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'sortable')},
            style         : {marginTop: '10px'},
            valueLabelText: 'sortable'
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
        }]
    }

    /**
     * @returns {*}
     */
    createExampleComponent() {
        return Neo.ntype({
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module   : ApiTreeList,
                draggable: true,
                height   : 800,
                width    : 400,

                dragZoneConfig: {
                    dropZoneIdentifier: {
                        cls: ['neo-example-dropzone']
                    }
                }
            }, {
                module: Panel,

                containerConfig: {
                    cls      : ['neo-example-dropzone'],
                    droppable: true
                },

                headers: [{
                    dock : 'top',
                    items: [{
                        ntype: 'label',
                        text : 'DropZone'
                    }]
                }],

                style: {
                    marginLeft: '2em',
                    minWidth  : '15em'
                }
            }]
        })
    }

    /**
     * @param {Object} opts
     */
    onLeafNodesOnlyChange(opts) {
        let dragZone = this.exampleComponent.down({module: ApiTreeList}).dragZone;

        if (dragZone) {
            dragZone.leafNodesOnly = opts.value
        }
    }
}

export default Neo.setupClass(MainContainer);
