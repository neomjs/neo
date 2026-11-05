import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ClassSystemUtilTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Base            from '../../../../src/core/Base.mjs';
import ClassSystemUtil from '../../../../src/util/ClassSystem.mjs';

class TestInstanceClass extends Base {
    static observable = true

    static config = {
        className: 'Test.Unit.Util.ClassSystem.TestInstanceClass',
        ntype    : 'test-unit-util-classsystem-instance',
        label_   : 'default-label',
        count_   : 0
    }
}

TestInstanceClass = Neo.setupClass(TestInstanceClass);

test.describe('Neo.util.ClassSystem', () => {
    test.describe('beforeSetInstance', () => {
        test('returns a new DefaultClass instance built with defaultValues when config is null and DefaultClass is a class', () => {
            const instance = ClassSystemUtil.beforeSetInstance(null, TestInstanceClass, {
                count: 7,
                label: 'from-defaults'
            });

            expect(instance).toBeInstanceOf(TestInstanceClass);
            expect(instance.className).toBe('Test.Unit.Util.ClassSystem.TestInstanceClass');
            expect(instance.label).toBe('from-defaults');
            expect(instance.count).toBe(7);

            instance.destroy();
        });

        test('resolves a DefaultClass name string via Neo.ns() and builds an instance with defaultValues when config is null', () => {
            const instance = ClassSystemUtil.beforeSetInstance(
                null,
                'Test.Unit.Util.ClassSystem.TestInstanceClass',
                {count: 11, label: 'from-class-name'}
            );

            expect(instance).toBeInstanceOf(TestInstanceClass);
            expect(instance.label).toBe('from-class-name');
            expect(instance.count).toBe(11);

            instance.destroy();
        });

        test('creates an instance with defaultValues when config is a Neo class', () => {
            const instance = ClassSystemUtil.beforeSetInstance(TestInstanceClass, null, {
                count: 19,
                label: 'from-config-class'
            });

            expect(instance).toBeInstanceOf(TestInstanceClass);
            expect(instance.label).toBe('from-config-class');
            expect(instance.count).toBe(19);

            instance.destroy();
        });

        test('creates an instance via Neo.ntype when config has an ntype, with config keys winning over defaultValues', () => {
            const instance = ClassSystemUtil.beforeSetInstance(
                {
                    ntype: 'test-unit-util-classsystem-instance',
                    label: 'config-wins'
                },
                null,
                {
                    count: 23,
                    label: 'default-loses'
                }
            );

            expect(instance).toBeInstanceOf(TestInstanceClass);
            expect(instance.label).toBe('config-wins');
            expect(instance.count).toBe(23);

            instance.destroy();
        });

        test('creates a DefaultClass instance when config is a plain object without ntype, merging defaultValues and config', () => {
            const instance = ClassSystemUtil.beforeSetInstance(
                {
                    label: 'plain-object-override'
                },
                TestInstanceClass,
                {
                    count: 31,
                    label: 'default-label-value'
                }
            );

            expect(instance).toBeInstanceOf(TestInstanceClass);
            expect(instance.label).toBe('plain-object-override');
            expect(instance.count).toBe(31);

            instance.destroy();
        });

        test('returns an existing Neo instance unchanged and attaches defaultValues.listeners via on()', () => {
            const existing = Neo.create(TestInstanceClass, {label: 'existing-instance'});
            const received = [];

            const returned = ClassSystemUtil.beforeSetInstance(existing, null, {
                listeners: {
                    ping(data) {
                        received.push(data.value);
                    }
                }
            });

            expect(returned).toBe(existing);
            expect(returned).toBeInstanceOf(TestInstanceClass);

            returned.fire('ping', {value: 'pong'});
            expect(received).toEqual(['pong']);

            existing.destroy();
        });

        test('returns null unchanged when both config and DefaultClass are null', () => {
            const result = ClassSystemUtil.beforeSetInstance(null);

            expect(result).toBeNull();
        });
    });
});
