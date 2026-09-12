import {setup} from '../../setup.mjs';

const appName = 'StateProviderAbsentKeyReadsTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Component       from '../../../../src/component/Base.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import StateProvider   from '../../../../src/state/Provider.mjs';

class MockComponent extends Component {
    static config = {
        className  : 'Mock.AbsentKeyReads.Component',
        appName,
        testConfig_: null,
        userObject_: null
    }
}
MockComponent = Neo.setupClass(MockComponent);

/**
 * A formula or binding that reads a data path which does not exist yet has no Config to depend on.
 * The provider therefore lets every lookup miss depend on the key set of the provider it looked in,
 * so exactly the effects that missed a key re-run once that key gets created, on the same provider
 * or on a parent, and nothing else re-runs.
 */
test.describe('Neo.state.Provider reads of absent keys', () => {
    test('a formula that read an absent top-level key at its first run re-runs when the key gets created', () => {
        let runs = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data    : {},
                formulas: {
                    greeting: data => {
                        runs++;
                        return data.user ? `hi ${data.user.name}` : 'nobody'
                    }
                }
            }
        });
        const provider = component.getStateProvider();

        expect(runs).toBe(1);
        expect(provider.getData('greeting')).toBe('nobody');

        // The missed key appears: one re-run, and the leaf is tracked from now on.
        provider.setData('user', {name: 'Ada'});
        expect(runs).toBe(2);
        expect(provider.getData('greeting')).toBe('hi Ada');

        provider.setData('user.name', 'Grace');
        expect(runs).toBe(3);
        expect(provider.getData('greeting')).toBe('hi Grace');

        // Every read resolves now, so an unrelated new key does not re-run it.
        provider.setData('unrelated', 1);
        expect(runs).toBe(3);

        component.destroy();
    });

    test('a dotted path created under an absent parent reaches a formula, and a formula creating its own result key neither loops nor re-runs on unrelated keys', () => {
        let doubledRuns = 0;

        const component = Neo.create(MockComponent, {
            stateProvider: {
                data    : {a: 1},
                formulas: {
                    doubled: data => {
                        doubledRuns++;
                        return data.a * 2
                    },
                    late: data => data.nested?.leaf ?? -1
                }
            }
        });
        const provider = component.getStateProvider();

        // The first run wrote the result key 'doubled' itself: that creation must not re-enter the formula.
        expect(doubledRuns).toBe(1);
        expect(provider.getData('doubled')).toBe(2);
        expect(provider.getData('late')).toBe(-1);

        provider.setData('nested.leaf', 5);
        expect(provider.getData('late')).toBe(5);

        // 'doubled' missed nothing, so the new keys did not re-run it.
        expect(doubledRuns).toBe(1);

        provider.setData('a', 4);
        expect(provider.getData('doubled')).toBe(8);
        expect(doubledRuns).toBe(2);

        component.destroy();
    });

    test('a child formula that missed a key picks it up when a parent creates it, and again when the child shadows it', () => {
        const parentComponent = Neo.create(MockComponent, {stateProvider: {data: {}}});
        const childComponent  = Neo.create(MockComponent, {
            parentComponent,

            stateProvider: {
                data    : {},
                formulas: {
                    label: data => data.shared === undefined ? 'unset' : `shared:${data.shared}`
                }
            }
        });

        const
            parentProvider = parentComponent.getStateProvider(),
            childProvider  = childComponent.getStateProvider();

        expect(childProvider.getData('label')).toBe('unset');

        parentProvider.setData('shared', 7);
        expect(childProvider.getData('label')).toBe('shared:7');

        childProvider.setDataAtSameLevel('shared', 8);
        expect(childProvider.getData('label')).toBe('shared:8');

        childComponent.destroy();
        parentComponent.destroy();
    });

    test('creating a key re-runs only the bindings that read it while it was absent', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {known: 'k'}}});
        const provider  = component.getStateProvider();

        let readerRuns    = 0,
            bystanderRuns = 0;

        provider.createBinding(component.id, 'testConfig', data => {
            readerRuns++;
            return data.later ?? null
        });

        provider.createBinding(component.id, 'userObject', data => {
            bystanderRuns++;
            return data.known
        });

        expect([readerRuns, bystanderRuns]).toEqual([1, 1]);
        expect(component.testConfig).toBe(null);

        component.setState('later', 'now');
        expect([readerRuns, bystanderRuns]).toEqual([2, 1]);
        expect(component.testConfig).toBe('now');

        component.destroy();
    });

    test('getData of an absent key inside a binding formatter is a tracked read as well', () => {
        const component = Neo.create(MockComponent, {stateProvider: {data: {}}});
        const provider  = component.getStateProvider();

        let runs = 0;

        provider.createBinding(component.id, 'testConfig', function() {
            runs++;
            return this.getData('flag') ?? 'absent'
        });

        expect(runs).toBe(1);
        expect(component.testConfig).toBe('absent');

        provider.setData('flag', 'present');
        expect(runs).toBe(2);
        expect(component.testConfig).toBe('present');

        component.destroy();
    });
});
