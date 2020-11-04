import ApiTreeList           from '../../docs/app/view/ApiTreeList.mjs';
import CheckBox              from '../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../ConfigurationViewport.mjs';
import NumberField           from '../../src/form/field/Number.mjs';

/**
 * @class ExamplesTree.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'ExamplesTree.MainContainer',
        ntype    : 'main-container',

        autoMount           : true,
        configItemLabelWidth: 100,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me       = this,
            treeList = me.exampleComponent;

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
            checked       : treeList.dragZone && treeList.dragZone.leafNodesOnly || false,
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
        }];
    }

    /**
     *
     * @returns {*}
     */
    createExampleComponent() {
        return Neo.create({
            module   : ApiTreeList,
            draggable: true,
            height   : 800,
            width    : 400,

            dragZoneConfig: {
                dropZoneIdentifier: {
                    cls: ['neo-configuration-panel-body']
                }
            }
        });
    }

    /**
     *
     * @param {Object} opts
     */
    onLeafNodesOnlyChange(opts) {
        let dragZone = this.exampleComponent.dragZone;

        if (dragZone) {
            dragZone.leafNodesOnly = opts.value;
        }
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};