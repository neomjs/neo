import {setup} from '../../../../../setup.mjs';

const appName = 'PortalHomeHeroContentTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import Neo                from '../../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../../../src/vdom/Helper.mjs';
import HeroContent        from '../../../../../../../apps/portal/view/home/parts/hero/Content.mjs';

const
    currentDir    = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot      = path.resolve(currentDir, '../../../../../../../'),
    learnTreePath = path.join(repoRoot, 'learn/tree.json'),
    setupDocPath  = path.join(repoRoot, 'learn/gettingstarted/Setup.md');

const EXPECTED_CYCLE_TEXTS = [
    'An Agent Institution',
    'AI Peers Who Own Their Work',
    'Rival Labs, Accountable to Each Other',
    'Peers, Not Cast Roles',
    'A Swarm That Improves Itself',
    'The Team Works While You Sleep',
    'Conversational UIs and Apps',
    'It Predicts Its Own Evolution'
];

const EXPECTED_HERO_LEAD =
    'Neo.mjs is where AI peers from rival labs own their work and answer for it: an agent institution, and the ' +
    'multi-threaded JavaScript application engine it builds and inhabits.';

const EXPECTED_HERO_PROJECTS =
    'Three open-source projects: the engine with grids, Gantt charts and task boards, the Agent OS, and the team\'s cockpit.';

test.describe('Portal.view.home.parts.hero.Content', () => {
    test('Get started button targets /learn/gettingstarted/Setup and resolves to an existing learn tree guide', async () => {
        const getStartedConfig = HeroContent.config.items[3].items.find(item => item.cls?.includes('get-started-button'));

        expect(HeroContent.config.initialHoldDelay).toBe(5300);
        expect(getStartedConfig.route).toBe('/learn/gettingstarted/Setup');
        expect(getStartedConfig.text).toBe('Get started');
        expect(getStartedConfig.ui).toBe('primary');

        const hero = Neo.create(HeroContent, {appName});

        try {
            await hero.initVnode();

            const getStartedButton = hero.items[3].items[0];
            expect(getStartedButton.route).toBe('/learn/gettingstarted/Setup');
            expect(getStartedButton.cls).toContain('neo-button-primary');
            expect(getStartedButton.vdom.tag).toBe('a');
            expect(getStartedButton.vdom.href).toBe('#/learn/gettingstarted/Setup');
        } finally {
            hero.destroy()
        }

        const treeData    = JSON.parse(fs.readFileSync(learnTreePath, 'utf8')).data,
              setupRecord = treeData.find(record => record.id === 'gettingstarted/Setup');

        expect(setupRecord).toBeTruthy();
        expect(setupRecord.name).toBe('Setup');
        expect(fs.existsSync(setupDocPath)).toBe(true);
        expect(fs.statSync(setupDocPath).size).toBeGreaterThan(0)
    });

    test('pins the eight cycle phrases and the sentence as one h3 with a lead and a projects line', async () => {
        const magicMoveConfig = HeroContent.config.items[1],
              subHeaderConfig = HeroContent.config.items[2];

        expect(magicMoveConfig.autoCycle).toBe(false);
        expect(magicMoveConfig.cycleTexts).toEqual(EXPECTED_CYCLE_TEXTS);
        expect(magicMoveConfig.cycleTexts[0]).toBe('An Agent Institution');

        expect(subHeaderConfig.vdom).toEqual({
            tag: 'h3',
            cn : [
                {tag: 'span', cls: ['hero-lead'],     text: EXPECTED_HERO_LEAD},
                {vtype: 'text', text: ' '},
                {tag: 'span', cls: ['hero-projects'], text: EXPECTED_HERO_PROJECTS}
            ]
        });

        const hero = Neo.create(HeroContent, {appName});

        try {
            await hero.initVnode();

            const {vnode} = hero.items[2];

            // Crawlers and screen readers get one sentence: both lines, joined by the text node
            expect(vnode.nodeName).toBe('h3');
            expect(vnode.className).toContain('neo-h3');
            expect(vnode.childNodes.map(node => node.textContent ?? node.innerHTML).join(''))
                .toBe(`${EXPECTED_HERO_LEAD} ${EXPECTED_HERO_PROJECTS}`)
        } finally {
            hero.destroy()
        }
    });

    test('initial activate() holds "An Agent Institution", ignores duplicate activate(), then enables autoCycle', async () => {
        const hero      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMove = hero.getItem('magic-move');

        try {
            expect(hero.initialHoldPending).toBe(true);
            expect(magicMove.autoCycle).toBe(false);
            expect(magicMove.currentIndex).toBe(0);

            hero.activate();

            expect(hero.initialHoldPending).toBe(false);
            expect(magicMove.currentIndex).toBe(1);
            expect(magicMove.text).toBe('An Agent Institution');
            expect(magicMove.autoCycle).toBe(false);

            // Duplicate IntersectionObserver activation during hold must be idempotent
            hero.activate();
            expect(magicMove.currentIndex).toBe(1);
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 25));
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 55));
            expect(magicMove.autoCycle).toBe(true)
        } finally {
            hero.destroy()
        }
    });

    test('deactivate() and destroy() cancel the initial hold timer cleanly, and re-activation resumes autoCycle immediately', async () => {
        const hero      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMove = hero.getItem('magic-move');

        try {
            hero.activate();
            expect(magicMove.text).toBe('An Agent Institution');
            expect(magicMove.autoCycle).toBe(false);

            hero.deactivate();
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 80));
            expect(magicMove.autoCycle).toBe(false);

            // Subsequent activation starts autoCycle immediately without repeating the initial hold
            hero.activate();
            expect(magicMove.autoCycle).toBe(true)
        } finally {
            hero.destroy()
        }

        const heroToDestroy      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMoveToDestroy = heroToDestroy.getItem('magic-move'),
              originalSet        = globalThis.setTimeout,
              originalClear      = globalThis.clearTimeout,
              activeHoldTimers   = new Set();

        globalThis.setTimeout = (fn, delay, ...rest) => {
            const id = originalSet(fn, delay, ...rest);
            if (delay === 60) {
                activeHoldTimers.add(id)
            }
            return id
        };

        globalThis.clearTimeout = id => {
            activeHoldTimers.delete(id);
            return originalClear(id)
        };

        try {
            heroToDestroy.activate();
            expect(activeHoldTimers.size).toBe(1);

            heroToDestroy.destroy();
            expect(activeHoldTimers.size).toBe(0);
            expect(heroToDestroy.isDestroyed).toBe(true)
        } finally {
            globalThis.setTimeout   = originalSet;
            globalThis.clearTimeout = originalClear
        }

        await originalSet ? new Promise(resolve => setTimeout(resolve, 80)) : Promise.resolve();
        expect(magicMoveToDestroy.autoCycle).toBeFalsy()
    });

    test('a tab switch during the initial hold leaves one live rotation on return and none after deactivate()', async () => {
        const
            originalSetInterval   = globalThis.setInterval,
            originalClearInterval = globalThis.clearInterval,
            liveIntervals         = new Set();

        globalThis.setInterval = (...args) => {
            const id = originalSetInterval(...args);
            liveIntervals.add(id);
            return id
        };

        globalThis.clearInterval = id => {
            liveIntervals.delete(id);
            return originalClearInterval(id)
        };

        const hero      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMove = hero.getItem('magic-move');

        try {
            await hero.initVnode();
            magicMove.mounted = true;

            hero.activate();
            expect(liveIntervals.size).toBe(0);

            magicMove.onVisibilityChange({hidden: true, visibilityState: 'hidden', windowId: 1});
            expect(liveIntervals.size).toBe(0);

            await new Promise(resolve => setTimeout(resolve, 100));

            magicMove.onVisibilityChange({hidden: false, visibilityState: 'visible', windowId: 1});
            expect(liveIntervals.size).toBe(1);

            hero.deactivate();
            expect(liveIntervals.size).toBe(0)
        } finally {
            hero.destroy();
            for (const id of liveIntervals) {
                originalClearInterval(id)
            }
            globalThis.setInterval   = originalSetInterval;
            globalThis.clearInterval = originalClearInterval
        }
    })
});
