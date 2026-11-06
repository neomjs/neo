import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'TabRemovalSelectionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';
import '../../../../src/manager/Instance.mjs';

/** @summary Keeps active-card identity, layout and tab selection coherent when an active card is removed. */
test.describe('TabContainer active removal', () => {
    for (const silent of [false, true]) {
        for (const [name, count, activeIndex, nextIndex] of [
            ['first',  3, 0, 0],
            ['middle', 3, 1, 0],
            ['last',   3, 2, 1],
            ['only',   1, 0, null]
        ]) {
            test(`${name} active card selects its surviving neighbour (${silent ? 'silent' : 'ordinary'})`, async () => {
                const tabs = Neo.create(TabContainer, {
                    activeIndex,
                    items: Array.from({length: count}, (_, index) => ({
                        header: {text: `Card ${index}`},
                        html  : `Content ${index}`,
                        module: Component
                    }))
                });

                try {
                    await Promise.resolve();

                    const cards  = [...tabs.getCardContainer().items],
                          events = [];

                    cards.splice(activeIndex, 1);
                    tabs.on('activeIndexChange', ({item, oldValue, value}) => events.push({item, oldValue, value}));

                    tabs.removeAt(activeIndex, true, silent);

                    expect(tabs.activeIndex).toBe(nextIndex);
                    expect(tabs.getCardContainer().layout.activeIndex).toBe(nextIndex);
                    expect(tabs.getActiveCard()).toBe(nextIndex === null ? null : cards[nextIndex]);

                    await expect.poll(() => tabs.getTabButtons().map(button => button.pressed))
                        .toEqual(cards.map((card, index) => index === nextIndex));

                    cards.forEach((card, index) => {
                        expect(card.vdom.removeDom).toBe(index === nextIndex ? undefined : true);
                        expect(tabs.getTabButtons()[index].vdom['aria-selected']).toBe(index === nextIndex)
                    });

                    await expect.poll(() => events.length).toBe(silent ? 0 : 1);

                    if (!silent) {
                        expect(events).toEqual([{item: tabs.getActiveCard(), oldValue: activeIndex, value: nextIndex}])
                    }
                } finally {
                    tabs.destroy()
                }
            })
        }
    }
});
