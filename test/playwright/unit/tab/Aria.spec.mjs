import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'TabAriaWiringTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';
import EffectButton   from '../../../../src/tab/header/EffectButton.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get for the existing-instance insert path

/**
 * @summary Pins the WAI-ARIA tabs pattern on `Neo.tab.Container`.
 *
 * The header is the `tablist`, every tab states `aria-selected` and names its card in
 * `aria-controls`, and every card is a `tabpanel` labelled by its tab, without overriding a role or
 * an accessible name the card brought itself.
 */
test.describe('Neo.tab ARIA wiring', () => {
    let instances = [];

    const own = instance => {
        instances.push(instance);
        return instance
    };

    test.afterEach(() => {
        instances.reverse().forEach(instance => !instance.isDestroyed && instance.destroy());
        instances = []
    });

    test('the header is a tablist whose tabs name their cards, and each card is a panel labelled by its tab', () => {
        const tabs = own(Neo.create(TabContainer, {
            activeIndex: 1,
            items      : [
                {header: {text: 'One'}, module: Component},
                {header: {text: 'Two'}, module: Component}
            ]
        }));

        const bar = tabs.getTabBar().getVdomRoot();

        expect(bar.role).toBe('tablist');
        expect(bar['aria-orientation'], 'a top header is horizontal, the tablist default').toBeUndefined();

        tabs.getTabButtons().forEach((button, index) => {
            const card = tabs.getCard(index);

            expect(button.vdom.role).toBe('tab');
            expect(button.vdom['aria-selected'], 'an inactive tab says false, not nothing').toBe(index === 1);
            expect(button.vdom['aria-controls']).toBe(card.id);
            expect(card.getVdomRoot().role).toBe('tabpanel');
            expect(card.getVdomRoot()['aria-labelledby']).toBe(button.id)
        })
    });

    test('switching tabs moves aria-selected', async () => {
        const tabs = own(Neo.create(TabContainer, {
                items: [
                    {header: {text: 'One'}, module: Component},
                    {header: {text: 'Two'}, module: Component}
                ]
            })),
            [first, second] = tabs.getTabButtons();

        tabs.activeIndex = 1;

        await expect.poll(() => second.vdom['aria-selected']).toBe(true);
        expect(first.vdom['aria-selected']).toBe(false)
    });

    test('a card keeps a role and an accessible name of its own', () => {
        const tabs = own(Neo.create(TabContainer, {
                items: [
                    {header: {text: 'Grid'},  module: Component, role: 'grid'},
                    {header: {text: 'Named'}, module: Component, vdom: {'aria-label': 'Settings'}}
                ]
            })),
            [gridTab, namedTab] = tabs.getTabButtons(),
            grid  = tabs.getCard(0).getVdomRoot(),
            named = tabs.getCard(1).getVdomRoot();

        expect(grid.role).toBe('grid');
        expect(grid['aria-labelledby'], 'an unnamed card is still named by its tab').toBe(gridTab.id);
        expect(gridTab.vdom['aria-controls']).toBe(tabs.getCard(0).id);

        expect(named.role).toBe('tabpanel');
        expect(named['aria-label']).toBe('Settings');
        expect(named['aria-labelledby']).toBeUndefined();
        expect(namedTab.vdom['aria-controls']).toBe(tabs.getCard(1).id)
    });

    test('a header docked left or right declares a vertical tablist', () => {
        const tabs = own(Neo.create(TabContainer, {
                tabBarPosition: 'left',
                items         : [{header: {text: 'One'}, module: Component}]
            })),
            bar = tabs.getTabBar();

        expect(bar.getVdomRoot()['aria-orientation']).toBe('vertical');

        bar.dock = 'bottom';
        expect(bar.getVdomRoot()['aria-orientation']).toBeUndefined();

        bar.dock = 'right';
        expect(bar.getVdomRoot()['aria-orientation']).toBe('vertical')
    });

    test('inserted tabs are wired, and a card removed alive keeps only its own semantics', () => {
        const tabs = own(Neo.create(TabContainer, {
                items: [{header: {text: 'One'}, module: Component}]
            })),
            plain = tabs.add({header: {text: 'Plain'}, module: Component}),
            named = tabs.add({header: {text: 'Named'}, module: Component, role: 'region', vdom: {'aria-label': 'Mine'}}),
            plainTab = tabs.getTabButtons()[1];

        expect(plainTab.vdom['aria-controls']).toBe(plain.id);
        expect(plain.getVdomRoot()).toMatchObject({role: 'tabpanel', 'aria-labelledby': plainTab.id});

        expect(own(tabs.removeAt(2, false))).toBe(named);
        expect(named.getVdomRoot()).toMatchObject({role: 'region', 'aria-label': 'Mine'});

        expect(own(tabs.removeAt(1, false))).toBe(plain);
        expect(plain.role).toBeNull();
        expect(plain.getVdomRoot().role).toBeUndefined();
        expect(plain.getVdomRoot()['aria-labelledby']).toBeUndefined()
    });

    test('a card moved into another tab container is labelled by its new tab', () => {
        const source = own(Neo.create(TabContainer, {
                items: [
                    {header: {text: 'Stays'}, module: Component},
                    {header: {text: 'Moves'}, module: Component}
                ]
            })),
            target = own(Neo.create(TabContainer, {
                items: [{header: {text: 'Target'}, module: Component}]
            })),
            card = source.getCard(1);

        target.insert(1, card);

        const newTab = target.getTabButtons()[1];

        expect(source.getCount()).toBe(1);
        expect(target.getCard(1)).toBe(card);
        expect(newTab.vdom['aria-controls']).toBe(card.id);
        expect(card.getVdomRoot()).toMatchObject({role: 'tabpanel', 'aria-labelledby': newTab.id})
    });

    test('a lazy card names nothing until it loads', async () => {
        const tabs = own(Neo.create(TabContainer, {
                items: [
                    {header: {text: 'Eager'}, module: Component},
                    {header: {text: 'Lazy'},  module: () => import('../../../../src/component/Base.mjs')}
                ]
            })),
            lazyTab = tabs.getTabButtons()[1];

        expect(tabs.getCard(1)).not.toBeInstanceOf(Neo.component.Base);
        expect(lazyTab.vdom['aria-controls'], 'no node to point at yet').toBeUndefined();

        tabs.activeIndex = 1;

        await expect.poll(() => lazyTab.vdom['aria-controls']).toBeTruthy();

        const card = tabs.getCard(1);

        expect(card).toBeInstanceOf(Neo.component.Base);
        expect(lazyTab.vdom['aria-controls']).toBe(card.id);
        expect(card.getVdomRoot()).toMatchObject({role: 'tabpanel', 'aria-labelledby': lazyTab.id})
    });

    test('effect-based tab buttons carry the same wiring', async () => {
        const tabs = own(Neo.create(TabContainer, {
                items: [
                    {header: {module: EffectButton, text: 'One'}, module: Component},
                    {header: {module: EffectButton, text: 'Two'}, module: Component}
                ]
            })),
            [first, second] = tabs.getTabButtons();

        expect(first).toBeInstanceOf(EffectButton);
        expect(first.vdom).toMatchObject({role: 'tab', 'aria-selected': true, 'aria-controls': tabs.getCard(0).id});
        expect(second.vdom).toMatchObject({role: 'tab', 'aria-selected': false, 'aria-controls': tabs.getCard(1).id});

        tabs.activeIndex = 1;

        await expect.poll(() => second.vdom['aria-selected']).toBe(true);
        expect(first.vdom['aria-selected']).toBe(false)
    })
});
