import {setup} from '../../setup.mjs';

const appName = 'SegmentedButtonTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Segmented     from '../../../../src/button/Segmented.mjs';
import Container     from '../../../../src/container/Base.mjs';
import StateProvider from '../../../../src/state/Provider.mjs';
import Toolbar       from '../../../../src/toolbar/Base.mjs';

const choices = () => [
    {value: 'one', text: 'One'},
    {value: 'two', text: 'Two'},
    {value: 'off', text: 'Off', disabled: true}
];

test.describe('Neo.button.Segmented', () => {
    const owned  = [];
    const create = config => {
        const instance = Neo.create(Segmented, {appName, ...config});
        owned.push(instance);
        return instance
    };

    test.afterEach(() => owned.splice(0).forEach(instance => instance.destroy()));

    test('a declarative segmented-button creates the public button class with toolbar navigation', () => {
        const group = Neo.ntype({ntype: 'segmented-button', appName, choices: choices()});
        owned.push(group);

        expect(group.constructor).toBe(Segmented);
        expect(group.className).toBe('Neo.button.Segmented');
        expect(group).toBeInstanceOf(Toolbar);
        expect(group.keyboardNavigation).toBe(true);
        expect(group.value).toBe('one')
    });

    test('initial selection is independent of config order and ignores disabled or unknown values', () => {
        const first   = create({value: 'two', choices: choices()}),
              second  = create({choices: choices(), value: 'two'}),
              invalid = create({choices: choices(), value: 'off'});

        expect(first.value).toBe('two');
        expect(second.value).toBe('two');
        expect(invalid.value).toBe('one');
        expect(create({choices: [], value: 'missing'}).value).toBeNull();
        expect(create({choices: [{value: 'off', text: 'Off', disabled: true}]}).value).toBeNull()
    });

    test('programmatic and button selections publish only effective changes', () => {
        const toolbar = create({choices: choices(), value: 'one', itemDefaults: {useRippleEffect: false}}),
              events  = [];

        toolbar.on('change', ({value, oldValue}) => events.push({value, oldValue}));
        toolbar.value = 'two';
        toolbar.value = 'two';
        toolbar.value = 'missing';
        toolbar.items[0].onClick({});
        toolbar.items[0].onClick({});

        expect(toolbar.value).toBe('one');
        expect(events).toEqual([
            {value: 'two', oldValue: 'one'},
            {value: 'one', oldValue: 'two'}
        ]);
        expect(toolbar.items.map(button => button.vdom['aria-pressed'])).toEqual(['true', 'false', 'false']);
        expect(toolbar.items[2].disabled).toBe(true)
    });

    test('replacement retains a valid value, selects the next first enabled choice, and cleans up old buttons', () => {
        const toolbar  = create({choices: choices(), value: 'two'}),
              oldItems = [...toolbar.items],
              events   = [];

        toolbar.on('change', ({value, oldValue}) => events.push({value, oldValue}));
        toolbar.choices = [{value: 'two', text: 'Updated'}, {value: 'three', text: 'Three'}];
        expect(toolbar.value).toBe('two');
        expect(toolbar.items[0].text).toBe('Updated');
        expect(oldItems.filter(button => !toolbar.items.includes(button)).every(button => button.isDestroyed)).toBe(true);

        toolbar.choices = [{value: 'three', text: 'Three'}, {value: 'two', text: 'Two', disabled: true}];
        expect(toolbar.value).toBe('three');
        toolbar.choices = [];
        expect(toolbar.value).toBeNull();
        expect(events).toEqual([{value: 'three', oldValue: 'two'}, {value: null, oldValue: 'three'}])
    });

    for (const order of ['value first', 'choices first']) {
        test(`bulk set applies the requested choice with ${order}`, () => {
            const toolbar     = create({choices: choices(), value: 'one'}),
                  events      = [],
                  replacement = [
                      {value: 'one', text: 'One', disabled: true},
                      {value: 'three', text: 'Three'},
                      {value: 'four', text: 'Four'}
                  ];

            toolbar.on('change', ({value, oldValue}) => events.push({value, oldValue}));
            toolbar.set(order === 'value first'
                ? {value: 'four', choices: replacement}
                : {choices: replacement, value: 'four'});

            expect(toolbar.value).toBe('four');
            expect(toolbar.items.map(button => button.text)).toEqual(['One', 'Three', 'Four']);
            expect(toolbar.items.map(button => button.vdom['aria-pressed'])).toEqual(['false', 'false', 'true']);
            expect(events).toEqual([{value: 'four', oldValue: 'one'}])
        })
    }

    test('construction emits no change and disabling the group preserves selection and pressed state', () => {
        const events  = [],
              toolbar = create({
                  choices     : choices(),
                  value       : 'two',
                  itemDefaults: {useRippleEffect: false},
                  listeners   : {change: ({value, oldValue}) => events.push({value, oldValue})}
              });

        expect(events).toEqual([]);
        toolbar.disabled = true;
        expect(toolbar.items.map(button => button.disabled)).toEqual([true, true, true]);
        expect(toolbar.items.map(button => button.vdom['aria-pressed'])).toEqual(['false', 'true', 'false']);
        toolbar.items[0].onClick({});
        expect(toolbar.value).toBe('two');
        expect(events).toEqual([]);
        toolbar.disabled = false;
        expect(toolbar.items.map(button => button.disabled)).toEqual([false, false, true]);
        expect(toolbar.items.map(button => button.vdom['aria-pressed'])).toEqual(['false', 'true', 'false'])
    });

    test('provider binding carries value changes in both directions', () => {
        const container = Neo.create(Container, {
            appName,
            stateProvider: {module: StateProvider, data: {selection: 'two'}},
            items        : [{module: Segmented, choices: choices(), bind: {value: {key: 'selection', twoWay: true}}}]
        });
        owned.push(container);

        const provider = container.getStateProvider(),
              toolbar  = container.items[0];

        expect(toolbar.value).toBe('two');
        provider.setData({selection: 'one'});
        expect(toolbar.value).toBe('one');
        toolbar.value = 'two';
        expect(provider.data.selection).toBe('two')
    });

    test('inherited actions survive choice changes without becoming selected segments', () => {
        const toolbar       = create({choices: choices(), value: 'one', actions: [{action: 'save', text: 'Save'}]}),
              action        = toolbar.getAction('save'),
              actionPressed = action.pressed;

        expect(action).toBeTruthy();
        toolbar.value = 'two';
        toolbar.choices = [{value: 'two', text: 'Updated'}, {value: 'three', text: 'Three'}];
        toolbar.disabled = true;
        toolbar.disabled = false;
        expect(toolbar.value).toBe('two');
        expect(toolbar.getAction('save')).toBe(action);
        expect(action.pressed).toBe(actionPressed);
        expect(toolbar.items.filter(item => item.segmentValue !== undefined).map(item => item.vdom['aria-pressed']))
            .toEqual(['true', 'false'])
    });

    test('rejects malformed and duplicate choices without changing selection or buttons', () => {
        const toolbar        = create({choices: choices(), value: 'two'}),
              initialItems   = [...toolbar.items],
              initialChoices = toolbar.choices,
              events         = [];

        toolbar.on('change', event => events.push(event));
        for (const invalid of [
            [{value: 'one', text: 'One'}, {value: 'one', text: 'Duplicate'}],
            [{value: '', text: 'Empty'}],
            [{value: 'x', text: ''}],
            [{value: 'x', text: 'X', disabled: 'yes'}],
            [null]
        ]) {
            expect(() => { toolbar.choices = invalid }).toThrow();
            expect(toolbar.choices).toBe(initialChoices);
            expect(toolbar.items).toEqual(initialItems);
            expect(toolbar.value).toBe('two')
        }
        expect(events).toEqual([])
    })
});
