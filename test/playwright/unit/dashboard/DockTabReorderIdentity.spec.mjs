import {setup} from '../../setup.mjs';

const appName = 'DashboardDockTabReorderIdentityTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DockReconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs'; // installs the in-process renderer the real flights run through
import VdomHelper         from '../../../../src/vdom/Helper.mjs';                  // registers Neo.vdom.Helper for those flights
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

const TITLES = {alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta'};

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'main-tabs',
    items : Object.fromEntries(Object.entries(TITLES).map(([itemId, title]) => [itemId, {reference: itemId, title}])),
    nodes : {
        'main-tabs': {activeItemId: 'alpha', items: Object.keys(TITLES), type: 'tabs'}
    }
});

/**
 * Waits until the Workspace's refresh pointer is the promise which just settled.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<void>}
 */
const settleRefreshTail = async workspace => {
    let tail, guard = 0;

    do {
        tail = workspace.refreshPromise;
        await tail;

        if (++guard > 20) throw new Error('refresh tail did not converge within 20 hand-offs')
    } while (tail !== workspace.refreshPromise)
};

/**
 * Binds a headless Workspace through the real container adoption path, then mounts it.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<Neo.container.Base>}
 */
const bindAndMount = async workspace => {
    const parent = Neo.create(Container, {
        appName,
        items   : [workspace],
        windowId: 'tab-reorder-identity-window'
    });

    await parent.initVnode();
    parent.mounted = true;

    return parent
};

/**
 * Reads one tabs node on all three planes the reorder must keep in agreement: the item each live
 * card belongs to, the ids the header resolves positions through, and the committed order.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Object}
 */
const readNode = workspace => {
    const tab = DockReconciler.collectProjectedTabs(workspace.items[0]).get('main-tabs');

    return {
        tab,
        // The projection stamps a pane's item on its header config; a placeholder carries it on itself too.
        cards    : tab.getCardContainer().items.map(card => card.header?.dockItemId ?? card.dockItemId ?? null),
        committed: [...workspace.dockModel.nodes['main-tabs'].items],
        ids      : [...(tab.getTabBar().sortZoneConfig?.dockItemIds || [])],
        texts    : tab.getTabButtons().map(button => button.text)
    }
};

/**
 * The order a within-header move produces: the dragged item leaves `from` and lands at `to`.
 * @param {String[]} items
 * @param {Number} from
 * @param {Number} to
 * @returns {String[]}
 */
const moved = (items, from, to) => {
    const next = [...items];

    next.splice(to, 0, next.splice(from, 1)[0]);

    return next
};

/**
 * @summary A within-header tab reorder keeps the header's `dockItemIds` naming the item behind every
 * button and card, before the commit's projection lands and after.
 *
 * The header sort zone reorders the live buttons and cards through `tab.Container#moveTo`, then the
 * dock commits the same move to the document. Every positional reader — the reconciler pairing live
 * cards with items, a tab activation, the next drag — resolves an index through `dockItemIds`, so a
 * move that leaves those ids behind attributes each moved card to the item that used to hold its index.
 */
test.describe('Neo.dashboard.dock.interaction.TabContainer reorder identity', () => {
    let parent, workspace;

    test.afterEach(() => {
        parent?.destroy?.();
        parent    = null;
        workspace = null
    });

    for (const {name, from, to} of [
        {name: 'a move across two positions', from: 1, to: 3},
        {name: 'an adjacent swap',            from: 0, to: 1}
    ]) {
        test(`${name} keeps every card, button and id naming one item`, async () => {
            workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
            parent    = await bindAndMount(workspace);

            await settleRefreshTail(workspace);

            const before   = readNode(workspace),
                  expected = moved(before.ids, from, to);

            // The control: the first projection is aligned, so any later disagreement is the move's doing.
            expect(before.cards, 'the projected cards carry their items').toEqual(Object.keys(TITLES));
            expect(before.ids,   'the projected ids name those cards').toEqual(before.cards);

            before.tab.moveTo(from, to);

            const live = readNode(workspace);

            expect(live.ids, 'right after the live move, each id still names the card at its index').toEqual(live.cards);

            await settleRefreshTail(workspace);

            const after = readNode(workspace);

            expect(after.committed, 'the document committed the move').toEqual(expected);
            expect(after.cards,     'the cards land in the committed order').toEqual(expected);
            expect(after.ids,       'the ids name the cards at every index').toEqual(expected);
            expect(after.texts,     'each button shows its own item').toEqual(expected.map(itemId => TITLES[itemId]))
        })
    }

    test('a tab activated after a reorder commits the item its button shows', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        readNode(workspace).tab.moveTo(1, 3);
        await settleRefreshTail(workspace);

        const {tab, texts} = readNode(workspace);

        tab.activeIndex = texts.indexOf('Gamma');
        await settleRefreshTail(workspace);

        expect(workspace.dockModel.nodes['main-tabs'].activeItemId).toBe('gamma')
    });

    test('a second reorder after the first lands moves the item its button shows', async () => {
        workspace = Neo.create(DockWorkspace, {dockModel: createDocument()});
        parent    = await bindAndMount(workspace);

        await settleRefreshTail(workspace);

        readNode(workspace).tab.moveTo(1, 3);
        await settleRefreshTail(workspace);

        const mid  = readNode(workspace),
              from = mid.texts.indexOf('Delta');

        mid.tab.moveTo(from, 0);
        await settleRefreshTail(workspace);

        const after    = readNode(workspace),
              expected = moved(mid.committed, from, 0);

        expect(after.committed).toEqual(expected);
        expect(after.cards).toEqual(expected);
        expect(after.ids).toEqual(expected);
        expect(after.texts).toEqual(expected.map(itemId => TITLES[itemId]))
    })
});
