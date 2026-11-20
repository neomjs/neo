import {setup} from '../../setup.mjs';

const appName = 'CoreParseItemConfigsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import AmChart        from '../../../../src/component/wrapper/AmChart.mjs';
import Base           from '../../../../src/core/Base.mjs';
import ColorField     from '../../../../src/form/field/Color.mjs';

class ConfigSource extends Base {
    static config = {
        className: 'Test.Unit.Core.ParseItemConfigs.ConfigSource',
        label    : 'from the instance'
    }
}

ConfigSource = Neo.setupClass(ConfigSource);

class HeatMapChart extends AmChart {
    static config = {
        className        : 'Test.Unit.Core.ParseItemConfigs.HeatMapChart',
        heatRulesMaxValue: 42,
        chartConfig      : {
            series: [{
                heatRules: [{maxValue: '@config:heatRulesMaxValue'}]
            }]
        }
    }
}

HeatMapChart = Neo.setupClass(HeatMapChart);

/**
 * `parseItemConfigs()` reads a plain object as a keyed items map. A caller holding one config
 * object passes it as one item, or its own '@config:' entries stay strings.
 */
test.describe('Neo.core.Base#parseItemConfigs() (#21324)', () => {
    let instance;

    test.afterEach(() => {
        instance?.destroy();
        instance = null
    });

    test('resolves every item of a keyed items map', () => {
        instance = Neo.create(ConfigSource);

        const items = {
            first : {text: '@config:label'},
            second: {text: '@config:label'}
        };

        instance.parseItemConfigs(items);

        expect(items.first.text).toBe('from the instance');
        expect(items.second.text).toBe('from the instance')
    });

    test('resolves the entries of one config object passed as an item, at any depth', () => {
        instance = Neo.create(ConfigSource);

        const config = {text: '@config:label', series: [{name: '@config:label'}]};

        instance.parseItemConfigs([config]);

        expect(config.text).toBe('from the instance');
        expect(config.series[0].name).toBe('from the instance')
    });

    test('a color field hands its own formatter and field to its list', () => {
        instance = Neo.create(ColorField, {
            appName,
            store: {
                data: [{id: 'red', name: 'red'}, {id: 'blue', name: 'blue'}]
            }
        });

        const {listConfig} = instance;

        expect(typeof listConfig.colorFormatter).toBe('function');
        expect(listConfig.colorFormatter).toBe(instance.colorFormatter);
        expect(listConfig.colorField).toBe('name')
    });

    test('an amCharts wrapper resolves a heat rule nested in its chartConfig', () => {
        // Not destroyed: AmChart#destroy() messages the main thread's AmCharts addon, absent in a unit run
        const chart = Neo.create(HeatMapChart, {appName});

        expect(chart.chartConfig.series[0].heatRules[0].maxValue).toBe(42)
    })
});
