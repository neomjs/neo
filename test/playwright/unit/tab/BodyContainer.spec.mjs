import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'TabBodyContainerAtomicMoveTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import BodyContainer  from '../../../../src/tab/BodyContainer.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get for the existing-instance insert path

/**
 * @summary Pins the tab adapters to `Neo.container.Base`'s four-argument atomic-remove contract.
 *
 * A silent cross-parent move must keep a live card mounted until the caller updates the common
 * ancestor. Both BodyContainer paths matter: projected Neo instances use its direct base path,
 * while ordinary tab configs delegate removal through their owning TabContainer.
 */
test.describe('Neo.tab.BodyContainer atomic moves', () => {
    test('direct projected cards preserve mounted state when keepMounted is true', () => {
        const body = Neo.create(BodyContainer, {
                items: [{module: Component}]
            }),
            card = body.items[0];

        card.mounted = true;

        expect(body.remove(card, false, true, true)).toBe(card);
        expect(body.items).toHaveLength(0);
        expect(card.mounted).toBe(true)
    });

    test('tab-owned cards forward keepMounted through TabContainer.removeAt', () => {
        const tabs = Neo.create(TabContainer, {
                items: [{header: {text: 'Atomic'}, module: Component}]
            }),
            body = tabs.getCardContainer(),
            card = body.items[0];

        expect(card.isTab).toBe(true);
        card.mounted = true;
        expect(body.remove(card, false, true, true)).toBe(card);

        expect(body.items).toHaveLength(0);
        expect(tabs.getTabBar().items).toHaveLength(0);
        expect(card.mounted).toBe(true)
    });

    test('tab-owned active-card moves keep header and replacement-card changes silent', () => {
        const tabs = Neo.create(TabContainer, {
                activeIndex: 1,
                items      : [
                    {header: {text: 'First'},  module: Component},
                    {header: {text: 'Second'}, module: Component}
                ]
            }),
            body          = tabs.getCardContainer(),
            tabBar        = tabs.getTabBar(),
            movedCard     = body.items[1],
            remainingCard = body.items[0],
            remainingTab  = tabBar.items[0];
        let bodyUpdates            = 0,
            remainingCardWasSilent = false,
            remainingTabWasSilent  = false,
            tabBarUpdates          = 0;

        body.update   = () => bodyUpdates++;
        tabBar.update = () => tabBarUpdates++;

        const
            afterSetPressed    = remainingTab.afterSetPressed.bind(remainingTab),
            afterSetWrapperCls = remainingCard.afterSetWrapperCls.bind(remainingCard);

        remainingCard.afterSetWrapperCls = (...args) => {
            remainingCardWasSilent = Boolean(remainingCard.silentVdomUpdate);
            afterSetWrapperCls(...args)
        };
        remainingTab.afterSetPressed = (...args) => {
            remainingTabWasSilent = Boolean(remainingTab.silentVdomUpdate);
            afterSetPressed(...args)
        };

        movedCard.mounted = true;
        expect(body.remove(movedCard, false, true, true)).toBe(movedCard);

        expect(bodyUpdates, 'the body waits for the closest-common-parent commit').toBe(0);
        expect(tabBarUpdates, 'the tab header waits for the closest-common-parent commit').toBe(0);
        expect(tabs.activeIndex).toBe(0);
        expect(remainingCard.wrapperCls).toContain('neo-active-item');
        expect(remainingCard.wrapperCls).not.toContain('neo-inactive-item');
        expect(remainingCard.vdom.removeDom).toBeUndefined();
        expect(remainingCardWasSilent).toBe(true);
        expect(remainingTab.pressed).toBe(true);
        expect(remainingTabWasSilent).toBe(true);
        expect(movedCard.mounted).toBe(true)
    });

    test('ordinary non-destructive removals still unmount cards', () => {
        const directBody = Neo.create(BodyContainer, {
                items: [{module: Component}]
            }),
            directCard = directBody.items[0],
            tabs = Neo.create(TabContainer, {
                items: [{header: {text: 'Ordinary'}, module: Component}]
            }),
            tabBody = tabs.getCardContainer(),
            tabCard = tabBody.items[0];

        directCard.mounted = true;
        tabCard.mounted    = true;

        directBody.remove(directCard, false, true);
        tabBody.remove(tabCard, false, true);

        expect(directCard.mounted).toBe(false);
        expect(tabCard.mounted).toBe(false)
    });

    test('an inactive projected card becomes renderable when atomically moved into an active slot', () => {
        const source = Neo.create(BodyContainer, {
                items : [{module: Component}, {module: Component}],
                layout: {ntype: 'card', activeIndex: 1}
            }),
            target = Neo.create(BodyContainer, {
                items : [{module: Component}],
                layout: {ntype: 'card', activeIndex: 0}
            }),
            card        = source.items[0],
            placeholder = target.items[0];
        let wrapperUpdateWasSilent = false;

        const afterSetWrapperCls = card.afterSetWrapperCls.bind(card);

        card.afterSetWrapperCls = (...args) => {
            wrapperUpdateWasSilent = Boolean(card.silentVdomUpdate);
            afterSetWrapperCls(...args)
        };

        expect(card.wrapperCls).toContain('neo-inactive-item');
        expect(card.vdom.removeDom).toBe(true);

        target.remove(placeholder, true, true);
        source.remove(card, false, true, true);
        target.insert(0, card, true, false);

        expect(target.items[0]).toBe(card);
        expect(card.wrapperCls).toContain('neo-active-item');
        expect(card.wrapperCls).not.toContain('neo-inactive-item');
        expect(card.vdom.removeDom).toBeUndefined();
        expect(wrapperUpdateWasSilent, 'the common-parent update remains the only DOM commit').toBe(true)
    })
});
