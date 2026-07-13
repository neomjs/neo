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
    })
});
