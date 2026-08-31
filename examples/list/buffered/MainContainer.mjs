import Buffered              from '../../../src/list/Buffered.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import PooledRow             from './PooledRow.mjs';

/**
 * @summary A `Neo.list.Buffered` over 5,000 records with the windowing knobs exposed live.
 *
 * The component had no example before this one, which mattered in practice: scroll-fidelity work on
 * it had nothing to point a browser at, and its two windowing configs — `bufferRowRange` and
 * `itemHeight` — are exactly the ones whose effect is invisible in a unit test that injects absolute
 * `scrollTop` values. Changing them here and scrolling shows what they do.
 *
 * `itemHeight` is deliberately a round 40px: the mounted range is `Math.floor(scrollTop /
 * itemHeight)`, so round values let a reader predict which record sits at any offset, and let a test
 * assert that a small wheel delta moves the viewport by that delta and no further.
 * @class Neo.examples.list.buffered.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.list.buffered.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            clearable: true,
            labelText: 'bufferRowRange',
            listeners: {change: me.onConfigChange.bind(me, 'bufferRowRange')},
            maxValue : 20,
            minValue : 0,
            stepSize : 1,
            value    : me.exampleComponent.bufferRowRange
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'itemHeight',
            listeners: {change: me.onConfigChange.bind(me, 'itemHeight')},
            maxValue : 120,
            minValue : 20,
            stepSize : 10,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.itemHeight
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 120,
            stepSize : 40,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module        : Buffered,
            bufferRowRange: 3,
            height        : 400,
            itemConfig    : ({record}) => ({module: PooledRow, record}),
            itemHeight    : 40,
            store         : MainStore,
            width         : 300
        })
    }
}

export default Neo.setupClass(MainContainer);
