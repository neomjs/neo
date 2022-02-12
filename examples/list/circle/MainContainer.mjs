import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import CircleList            from '../../../src/list/Circle.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';

/**
 * @class Neo.examples.list.circle.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.list.circle.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me     = this,
            sorter = me.exampleComponent.store.sorters[0];

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.disableSelection,
            labelText: 'disableSelection',
            listeners: {change: me.onConfigChange.bind(me, 'disableSelection')}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 5,
            value    : me.exampleComponent.height,
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : sorter.direction === 'ASC',
            hideValueLabel: false,
            labelText     : 'Sort',
            listeners     : {change: me.changeSorting.bind(me, 'ASC')},
            name          : 'sort',
            style         : {marginTop: '10px'},
            valueLabelText: 'ASC'
        }, {
            module        : Radio,
            checked       : sorter.direction === 'DESC',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.changeSorting.bind(me, 'DESC')},
            name          : 'sort',
            style         : {marginTop: '5px'},
            valueLabelText: 'DESC'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 1000,
            minValue : 300,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    changeSorting(direction, data) {
        if (data.value) {
            this.exampleComponent.store.sorters[0].direction = direction;
        }
    }

    createExampleComponent() {
        return Neo.create({
            module : CircleList,
            animate: true,
            height : 800,
            store  : MainStore,
            width  : 800
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
