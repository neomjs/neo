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
    'Self-Evolving Software Organism',
    'Professional AI Engineering Team',
    'The Application Engine for the AI Era',
    'Conversational UIs',
    'Agentic Control',
    'Neural Link Possession Interface',
    'Active Hybrid GraphRAG',
    'The Dream Pipeline',
    'Live Runtime Mutation',
    'AI-Native Runtime',
    'JSON Blueprints since 2019',
    'Object Permanence',
    'Context Engineering',
    'True Multithreading',
    'SharedWorker Simulations',
    'Physics-Driven UI',
    'Desktop-Class Performance',
    'Linear Scalability',
    'Multi-Window Orchestration',
    'Cross-Window Messaging',
    'Hierarchical State Management',
    'Clean Architecture',
    'Separation of Concerns',
    'Zero Build Step',
    '100% Web Standards',
    'No Transpilation',
    'Instant Page Reloads'
];

const EXPECTED_HERO_SENTENCE =
    "Neo.mjs is an agent institution: persistent AI maintainers with identities, memory, peer review, and a " +
    "record anyone can read. Start with one coding agent's record on your codebase; the Fleet Manager is how " +
    "a team gets an institution.";

test.describe('Portal.view.home.parts.hero.Content (#20946)', () => {
    test('Get started button targets /learn/gettingstarted/Setup and resolves to an existing learn tree guide', async () => {
        const getStartedConfig = HeroContent.config.items[3].items.find(item => item.cls?.includes('get-started-button'));

        expect(HeroContent.config.initialHoldDelay).toBe(5300);
        expect(getStartedConfig.route).toBe('/learn/gettingstarted/Setup');
        expect(getStartedConfig.text).toBe('Get started');

        const hero = Neo.create(HeroContent, {appName});

        try {
            await hero.initVnode();

            const getStartedButton = hero.items[3].items[0];
            expect(getStartedButton.route).toBe('/learn/gettingstarted/Setup');
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

    test('preserves the hero value-proposition sentence and all 28 MagicMoveText cycle phrases', () => {
        const magicMoveConfig = HeroContent.config.items[1],
              subHeaderConfig = HeroContent.config.items[2];

        expect(magicMoveConfig.autoCycle).toBe(false);
        expect(magicMoveConfig.cycleTexts).toEqual(EXPECTED_CYCLE_TEXTS);
        expect(magicMoveConfig.cycleTexts).toHaveLength(28);
        expect(magicMoveConfig.cycleTexts[0]).toBe('An Agent Institution');
        expect(subHeaderConfig.text).toBe(EXPECTED_HERO_SENTENCE)
    });

    test('initial activate() holds "An Agent Institution", ignores duplicate activate(), then enables autoCycle', async () => {
        const hero      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMove = hero.getItem('magic-move');

        try {
            expect(hero.initialHoldPending).toBe(true);
            expect(hero.initialHoldTimeoutId).toBeNull();
            expect(magicMove.autoCycle).toBe(false);
            expect(magicMove.currentIndex).toBe(0);

            hero.activate();

            const firstTimeoutId = hero.initialHoldTimeoutId;
            expect(hero.initialHoldPending).toBe(false);
            expect(firstTimeoutId).not.toBeNull();
            expect(magicMove.currentIndex).toBe(1);
            expect(magicMove.text).toBe('An Agent Institution');
            expect(magicMove.autoCycle).toBe(false);

            // Duplicate IntersectionObserver activation during hold must be idempotent
            hero.activate();
            expect(hero.initialHoldTimeoutId).toBe(firstTimeoutId);
            expect(magicMove.currentIndex).toBe(1);
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 25));
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 55));
            expect(hero.initialHoldTimeoutId).toBeNull();
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
            expect(hero.initialHoldTimeoutId).not.toBeNull();
            expect(magicMove.text).toBe('An Agent Institution');
            expect(magicMove.autoCycle).toBe(false);

            hero.deactivate();
            expect(hero.initialHoldTimeoutId).toBeNull();
            expect(magicMove.autoCycle).toBe(false);

            await new Promise(resolve => setTimeout(resolve, 80));
            expect(magicMove.autoCycle).toBe(false);

            // Subsequent activation starts autoCycle immediately without repeating the initial hold
            hero.activate();
            expect(hero.initialHoldTimeoutId).toBeNull();
            expect(magicMove.autoCycle).toBe(true)
        } finally {
            hero.destroy()
        }

        const heroToDestroy      = Neo.create(HeroContent, {appName, initialHoldDelay: 60}),
              magicMoveToDestroy = heroToDestroy.getItem('magic-move'),
              originalClear      = globalThis.clearTimeout,
              clearedTimeoutIds  = [];

        heroToDestroy.activate();
        const destroyTimeoutId = heroToDestroy.initialHoldTimeoutId;
        expect(destroyTimeoutId).not.toBeNull();

        globalThis.clearTimeout = id => {
            clearedTimeoutIds.push(id);
            return originalClear(id)
        };

        try {
            heroToDestroy.destroy()
        } finally {
            globalThis.clearTimeout = originalClear
        }

        expect(clearedTimeoutIds).toContain(destroyTimeoutId);
        expect(heroToDestroy.isDestroyed).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 80));
        expect(magicMoveToDestroy.autoCycle).toBeFalsy()
    })
});
