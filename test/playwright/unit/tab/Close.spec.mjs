import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'TabCloseIntentTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';
import HeaderButton   from '../../../../src/tab/header/Button.mjs';
import EffectButton   from '../../../../src/tab/header/EffectButton.mjs';
import DocsTabs       from '../../../../docs/app/view/ContentTabContainer.mjs';
import '../../../../src/manager/Instance.mjs';

/** @summary Pins one opt-in close intent for classic and effect-rendered tab headers. */
for (const Header of [HeaderButton, EffectButton]) {
    test.describe(`${Header.config.className} close intent`, () => {
        let tabs;

        const create = (config={}) => tabs = Neo.create(TabContainer, {
            items: ['One', 'Two', 'Three'].map(text => ({
                header: {closable: true, module: Header, text, useRippleEffect: false},
                html  : `${text} body`,
                module: Component
            })),
            ...config
        });

        test.afterEach(() => tabs?.destroy());

        test('closing is opt-in and its shortcut follows the live configuration', async () => {
            create({items: [{header: {module: Header, text: 'Permanent'}, module: Component}]});
            const header = tabs.getTabButtons()[0],
                  icon   = () => header.vdom.cn.find(node => node.cls?.includes('neo-tab-close'));

            expect(header.closable).toBe(false);
            expect(tabs.closeTab(0)).toBe(false);
            expect(icon()?.removeDom).toBe(true);
            expect(header.vdom['aria-keyshortcuts']).toBeFalsy();

            header.closable = true;
            await expect.poll(() => icon().removeDom).toBe(false);
            expect(header.vdom['aria-keyshortcuts']).toBe('Delete');
            expect(icon()).toMatchObject({tag: 'span', 'aria-hidden': true, id: `${header.id}__close`});
            expect(header.vdom.tag).toBe('button');

            header.closable = false;
            await expect.poll(() => icon().removeDom).toBe(true)
        });

        test('veto precedes either removal and a successful event keeps the original identity', () => {
            create();
            const card   = tabs.getCard(0), header = tabs.getTabButtons()[0],
                  cardId = card.id, headerId = header.id, events = [];
            let veto = true;

            tabs.on('beforeTabClose', data => {
                events.push(['before', tabs.getCount()]);
                data.abort = veto
            });
            tabs.on('tabClose', data => events.push(['closed', tabs.getCount(), data.cardId, data.headerId, data.text]));

            expect(tabs.closeTab(0)).toBe(false);
            expect(tabs.getCard(0)).toBe(card);
            expect(tabs.getTabButtons()[0]).toBe(header);
            expect(card.isDestroyed).toBeFalsy();

            veto = false;
            expect(tabs.closeTab(0)).toBe(card);
            expect(card.isDestroyed).toBe(true);
            expect(header.isDestroyed).toBe(true);
            expect(events).toEqual([['before', 3], ['before', 3], ['closed', 2, cardId, headerId, 'One']])
        });

        test('inactive closing preserves active card identity after reorder and beside header actions', () => {
            create({activeIndex: 2, headerActions: [{action: 'help', text: 'Help'}]});
            const activeCard = tabs.getActiveCard(), help = tabs.getAction('help');

            tabs.moveTo(0, 1);
            const header = tabs.getTabButtons()[0], card = tabs.getCard(0);

            tabs.onTabButtonClick({component: header, path: [{id: `${header.id}__close`}, {id: header.id}]});

            expect(card.isDestroyed).toBe(true);
            expect(tabs.getActiveCard()).toBe(activeCard);
            expect(tabs.getCount()).toBe(2);
            expect(tabs.getAction('help')).toBe(help);
            expect(help.isDestroyed).toBeFalsy()
        });

        test('an unloaded card closes without loading and produces a truthful close event', () => {
            let loads = 0, closed;
            create({items: [
                {header: {module: Header, text: 'Eager'}, module: Component},
                {header: {closable: true, module: Header, text: 'Lazy'}, module: () => {loads++; return import('../../../../src/component/Base.mjs')}}
            ]});
            const config = tabs.getCard(1), headerId = tabs.getTabButtons()[1].id;
            tabs.on('tabClose', data => {closed = data});

            expect(tabs.closeTab(1)).toBe(config);
            expect(loads).toBe(0);
            expect(closed).toMatchObject({card: config, cardId: null, headerId, index: 1, text: 'Lazy'});
            expect(tabs.getCount()).toBe(1)
        });

        test('close-target click skips ordinary button side effects while text still activates', () => {
            create();
            const header = tabs.getTabButtons()[1];
            let   calls  = 0;
            header.handler = () => calls++;

            const close = {component: header, path: [{id: `${header.id}__close`}, {id: header.id}]};
            header.onClick(close);
            expect(calls).toBe(0);
            tabs.onTabButtonClick(close);
            expect(tabs.getActiveCard().html).toBe('One body');

            const remaining = tabs.getTabButtons()[1];
            tabs.onTabButtonClick({component: remaining, path: [{id: `${remaining.id}__text`}, {id: remaining.id}]});
            expect(tabs.getActiveCard().html).toBe('Three body')
        });

        test('a close listener can reorder the target without redirecting removal', () => {
            create();
            const target = tabs.getCard(0);
            tabs.on('beforeTabClose', () => tabs.moveTo(0, 2));

            expect(tabs.closeTab(0)).toBe(target);
            expect(tabs.getCardContainer().items).not.toContain(target);
            expect(tabs.getCount()).toBe(2)
        });

        test('invalid targets and a listener that withdraws closability leave membership intact', () => {
            create();
            for (const index of [-1, 3, null, '1', NaN]) expect(tabs.closeTab(index)).toBe(false);

            const header = tabs.getTabButtons()[0], card = tabs.getCard(0);
            tabs.on('beforeTabClose', () => {header.closable = false});

            expect(tabs.closeTab(0)).toBe(false);
            expect(tabs.getCard(0)).toBe(card);
            expect(tabs.getCount()).toBe(3)
        });

        test('a listener that removes its target does not cause a second tab to close', () => {
            create();
            const target = tabs.getCard(0), survivor = tabs.getCard(1);
            let   closes = 0;
            tabs.on('beforeTabClose', () => tabs.removeAt(0));
            tabs.on('tabClose', () => closes++);

            expect(tabs.closeTab(0)).toBe(false);
            expect(target.isDestroyed).toBe(true);
            expect(tabs.getCard(0)).toBe(survivor);
            expect(tabs.getCount()).toBe(2);
            expect(closes).toBe(0)
        })
    })
}

test('Docs opts in through the generic header policy and retains its ordinary icon', () => {
    const tabs = Neo.create(DocsTabs, {
        items: [
            {header: {text: 'Temporary', iconCls: 'fa fa-code'}, module: Component},
            {header: {text: 'Permanent', closable: false}, module: Component}
        ]
    });

    try {
        const [temporary, permanent] = tabs.getTabButtons();
        expect(temporary.closable).toBe(true);
        expect(temporary.iconCls).toBe('fa fa-code');
        expect(permanent.closable).toBe(false);
        expect(tabs.closeTab(1)).toBe(false);
        tabs.onTabButtonClick({component: temporary, path: [{id: `${temporary.id}__glyph`}, {id: temporary.id}]});
        expect(tabs.getCount()).toBe(2)
    } finally {
        tabs.destroy()
    }
});

test.describe('pending lazy card membership', () => {
    let tabs, constructions, resolveImport;

    class PendingCard extends Component {
        static config = {className: 'Test.Unit.Tab.Close.PendingCard'}

        /** @summary Counts constructions after the deferred import settles. */
        construct(config) {
            super.construct(config);
            constructions++
        }
    }
    Neo.setupClass(PendingCard);

    test.beforeEach(() => {
        constructions = 0;
        const pending = new Promise(resolve => {resolveImport = resolve});
        tabs = Neo.create(TabContainer, {
            items: [
                {header: {text: 'A'}, module: Component},
                {header: {text: 'B', closable: true}, module: () => pending},
                {header: {text: 'C'}, module: Component}
            ]
        })
    });

    test.afterEach(() => !tabs.isDestroyed && tabs.destroy());

    test('a moved pending card settles in its current slot without overwriting its neighbour', async () => {
        const parked = tabs.getCard(1), neighbour = tabs.getCard(2),
              load   = tabs.getCardContainer().layout.loadModule(parked, 1);

        tabs.moveTo(1, 2);
        resolveImport({default: PendingCard});
        const loaded = await load;

        expect(tabs.getCard(1)).toBe(neighbour);
        expect(tabs.getCard(2)).toBe(loaded);
        expect(constructions).toBe(1);
        expect(tabs.getTabButtons()[2].cardId).toBe(loaded.id);
        expect(tabs.getTabButtons()[1].cardId).toBe(neighbour.id)
    });

    test('a pending active card follows its moved slot and keeps the neighbour inactive', async () => {
        const body    = tabs.getCardContainer(), parked = tabs.getCard(1), neighbour = tabs.getCard(2);
        const changes = [];
        tabs.on('activeIndexChange', data => changes.push(data));
        tabs.activeIndex = 1;
        const load = body.layout.loadModule(parked, 1);

        tabs.moveTo(1, 2);
        resolveImport({default: PendingCard});
        const loaded = await load;

        expect(tabs.activeIndex).toBe(2);
        expect(tabs.getActiveCard()).toBe(loaded);
        expect(loaded.wrapperCls).toContain('neo-active-item');
        expect(neighbour.wrapperCls).toContain('neo-inactive-item');
        expect(tabs.getCard(1)).toBe(neighbour);
        expect(changes, 'a superseded activation must not publish its old index with a different live card').toEqual([])
    });

    test('a replacement in the closed pending slot cannot inherit the old import', async () => {
        const body = tabs.getCardContainer(), parked = tabs.getCard(1), neighbour = tabs.getCard(2),
              load = body.layout.loadModule(parked, 1);
        tabs.closeTab(1);
        tabs.activateInsertedTabs = false;
        const replacement = tabs.insert(1, {header: {text: 'D'}, module: Component});

        resolveImport({default: PendingCard});

        expect(await load).toBeNull();
        expect(constructions).toBe(0);
        expect(tabs.getCard(1)).toBe(replacement);
        expect(tabs.getCard(2)).toBe(neighbour)
    });

    test('a new pending descriptor reusing the closed id owns its own flight and cleanup', async () => {
        const body = tabs.getCardContainer(), parked = tabs.getCard(1);
        parked.id = 'pending-tab-generation';
        const oldLoad = body.layout.loadModule(parked, 1);
        tabs.closeTab(1);
        tabs.activateInsertedTabs = false;

        let resolveNext, nextCalls = 0;
        const nextImport  = new Promise(resolve => {resolveNext = resolve}),
              replacement = tabs.insert(1, {
                  id    : 'pending-tab-generation', header: {text: 'D'},
                  module: () => {nextCalls++; return nextImport}
              }),
              nextLoad = body.layout.loadModule(replacement, 1);

        resolveImport({default: PendingCard});
        expect(await oldLoad).toBeNull();
        const joined = body.layout.loadModule({id: 'pending-tab-generation'}, 1);
        resolveNext({default: PendingCard});
        const [loaded, same] = await Promise.all([nextLoad, joined]);

        expect(nextCalls).toBe(1);
        expect(constructions).toBe(1);
        expect(same).toBe(loaded);
        expect(tabs.getCard(1)).toBe(loaded)
    });

    for (const activate of [false, true]) {
        test(`closing a ${activate ? 'active' : 'inactive'} pending card prevents late construction and publication`, async () => {
            const body         = tabs.getCardContainer(), parked = tabs.getCard(1), neighbour = tabs.getCard(2);
            let   loadedEvents = 0;
            body.on('cardLoaded', () => loadedEvents++);
            if (activate) tabs.activeIndex = 1;
            const load = body.layout.loadModule(parked, 1);

            expect(tabs.closeTab(1)).toBe(parked);
            resolveImport({default: PendingCard});
            expect(await load).toBeNull();
            await Promise.resolve();

            expect(constructions).toBe(0);
            expect(loadedEvents).toBe(0);
            expect(body.items).toHaveLength(2);
            expect(tabs.getCard(1)).toBe(neighbour);
            expect(tabs.getActiveCard()).toBe(tabs.getCard(0));
            expect(body.layout.activeIndex).toBe(0);
            expect(tabs.getTabButtons()[1].cardId).toBe(neighbour.id)
        })
    }

    test('destroying the owner while its import waits prevents late construction', async () => {
        const load = tabs.getCardContainer().layout.loadModule(tabs.getCard(1), 1);
        tabs.destroy();
        resolveImport({default: PendingCard});

        expect(await load).toBeNull();
        expect(constructions).toBe(0)
    });

    test('closing the only remaining pending tab keeps the settled empty state', async () => {
        const body = tabs.getCardContainer(), parked = tabs.getCard(1);
        tabs.activeIndex = 1;
        const load = body.layout.loadModule(parked, 1);
        tabs.removeAt(2);
        tabs.removeAt(0);
        tabs.closeTab(0);
        resolveImport({default: PendingCard});

        expect(await load).toBeNull();
        expect(constructions).toBe(0);
        expect(tabs.getCount()).toBe(0);
        expect(body.items).toHaveLength(0);
        expect(tabs.activeIndex).toBeNull();
        expect(body.layout.activeIndex).toBeNull()
    })
});
