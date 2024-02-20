import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import CircleList            from '../../../src/list/Circle.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.list.circle.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.list.circle.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @returns {Object[]}
     */
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
        }, {
            module   : TextField,
            flex     : 'none',
            labelText: 'Group1 Name',
            listeners: {change: me.onGroupNameChange.bind(me, 0)},
            name     : 'group1',
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.store.getAt(0).name
        }, {
            module   : TextField,
            flex     : 'none',
            labelText: 'Group2 Name',
            listeners: {change: me.onGroupNameChange.bind(me, 1)},
            name     : 'group2',
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.store.getAt(1).name
        }];
    }

    /**
     * @param {String} direction
     * @param {Object} data
     */
    changeSorting(direction, data) {
        if (data.value) {
            this.exampleComponent.store.sorters[0].direction = direction;
        }
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        let list = Neo.create({
            module : CircleList,
            animate: true,
            height : 1000,
            store  : MainStore,
            width  : 1000
        });

        list.store.on('sort', this.onStoreSort, this);

        return list;
    }

    /**
     * @param {Number} index
     * @param {Object} data
     */
    onGroupNameChange(index, data) {
        this.exampleComponent.items[index].title = data.value;
    }

    /**
     * @param {Object} data
     */
    onStoreSort(data) {
        setTimeout(() => {
            let me    = this,
                items = me.exampleComponent.items;

            me.down({name: 'group1'}).value = items[0].title;
            me.down({name: 'group2'}).value = items[1].title;
        }, 10);
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
