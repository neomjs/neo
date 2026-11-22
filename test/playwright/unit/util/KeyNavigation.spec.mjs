import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'KeyNavigationUnitTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import KeyNavigation  from '../../../../src/util/KeyNavigation.mjs';
import '../../../../src/manager/Component.mjs';

test.describe('Neo.util.KeyNavigation', () => {
    let navigation;

    test.beforeEach(() => {
        navigation = Neo.create(KeyNavigation, {keys: []})
    });

    test.afterEach(() => {
        navigation.destroy()
    });

    test('normalizes the space and arrow aliases and preserves other keys', () => {
        const aliases = [
            [' ', 'SPACE'],
            ['ARROWDOWN', 'DOWN'],
            ['ARROWLEFT', 'LEFT'],
            ['ARROWRIGHT', 'RIGHT'],
            ['ARROWUP', 'UP'],
            ['ENTER', 'ENTER']
        ];

        for (const [input, expected] of aliases) {
            expect(navigation.parseUpperCaseKey(input), JSON.stringify(input)).toBe(expected)
        }
    });

    test('registration uses the component scope and adds one keydown listener', () => {
        const listenerCalls = [],
              component     = {id: 'key-navigation-owner', addDomListeners: config => listenerCalls.push(config)};

        navigation.keys = {Enter: 'onEnter', Down: 'onDown'};
        navigation.register(component);

        expect(navigation.keys).toEqual([
            {fn: 'onEnter', key: 'Enter', scope: component.id},
            {fn: 'onDown', key: 'Down', scope: component.id}
        ]);
        expect(listenerCalls).toEqual([{
            keydown: {bubble: false, fn: navigation.onKeyDown, scope: navigation}
        }])
    });

    test('parses an explicit scope and passes an existing listener array through', () => {
        const component = {id: 'key-navigation-default-scope', addDomListeners() {}},
              keys      = [{fn: 'onEscape', key: 'Escape', scope: 'custom-scope'}];

        navigation.register(component);

        expect(navigation.parseKeys({scope: 'custom-scope', Escape: 'onEscape'})).toEqual(keys);
        expect(navigation.parseKeys(keys)).toBe(keys)
    });

    test('dispatches case-insensitive aliases with the original event and scope', () => {
        const shortcuts = [
            ['eNtEr', 'Enter'],
            ['ArrowDown', 'Down'],
            ['ArrowLeft', 'Left'],
            ['ArrowRight', 'Right'],
            ['ArrowUp', 'Up'],
            [' ', 'Space']
        ];
        const calls = [],
              scope = {
                  onEnter(data) {calls.push({data, key: 'Enter', scope: this})}
              },
              events = shortcuts.map(([key]) => ({key}));

        navigation.keys = shortcuts.map(([, key]) => ({
            fn: key === 'Enter' ? 'onEnter' : function (data) {calls.push({data, key, scope: this})},
            key,
            scope
        }));
        const registeredScopes = navigation.keys.map(key => key.scope);

        events.forEach(data => navigation.onKeyDown(data));

        expect(calls.map(({key}) => key)).toEqual(shortcuts.map(([, key]) => key));
        calls.forEach((call, index) => {
            expect(call.data).toBe(events[index]);
            expect(call.scope).toBe(registeredScopes[index])
        })
    });

    test('ignores keydown events without a key and skips missing scope methods', () => {
        const events = [], scope = {};

        navigation.keys = [
            {fn: 'missing', key: 'Enter', scope},
            {fn: data => events.push(data), key: 'Enter', scope}
        ];
        navigation.onKeyDown({});
        expect(events).toEqual([]);

        const event = {key: 'Enter'};

        navigation.onKeyDown(event);
        expect(events).toEqual([event])
    });

    test('removes only the first structurally matching listener', () => {
        const first     = {fn: 'onEnter', key: 'Enter', scope: 'keys'},
              duplicate = {...first},
              remaining = {fn: 'onEscape', key: 'Escape', scope: 'keys'};

        navigation.keys = [first, duplicate, remaining];
        const registeredDuplicate = navigation.keys[1];

        navigation.removeKey({...first});

        expect(navigation.keys).toEqual([duplicate, remaining]);
        expect(navigation.keys[0]).toBe(registeredDuplicate);

        navigation.removeKey({fn: 'onUp', key: 'Up', scope: 'keys'});
        expect(navigation.keys).toEqual([duplicate, remaining])
    });

    test('removes a list of listeners and ignores non-array inputs', () => {
        const enter  = {fn: 'onEnter', key: 'Enter', scope: 'keys'},
              escape = {fn: 'onEscape', key: 'Escape', scope: 'keys'},
              up     = {fn: 'onUp', key: 'Up', scope: 'keys'};

        navigation.keys = [enter, escape, up];
        navigation.removeKeys(escape);
        expect(navigation.keys).toEqual([enter, escape, up]);

        navigation.removeKeys([{...escape}, {...up}]);
        expect(navigation.keys).toEqual([enter])
    })
});
