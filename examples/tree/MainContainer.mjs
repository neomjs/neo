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
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me       = this,
            treeList = me.exampleComponent;

        return [{
            module   : CheckBox,
            checked  : treeList.disableSelection,
            labelText: 'disableSelection',
            listeners: {change: me.onConfigChange.bind(me, 'disableSelection')}
        }, {
            module   : CheckBox,
            checked  : treeList.draggable,
            labelText: 'draggable',
            listeners: {change: me.onConfigChange.bind(me, 'draggable')},
            style    : {marginTop: '10px'}
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
            module   : CheckBox,
            checked  : treeList.sortable,
            labelText: 'sortable',
            listeners: {change: me.onConfigChange.bind(me, 'sortable')},
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

    createExampleComponent() {
        return Neo.create({
            module: ApiTreeList,
            height: 800,
            width : 400
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};