import {setup} from '../../../../../setup.mjs';

const appName = 'PortalHomeAudienceDoorsTest';

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
import AudienceDoors      from '../../../../../../../apps/portal/view/home/parts/AudienceDoors.mjs';
import HeroContent        from '../../../../../../../apps/portal/view/home/parts/hero/Content.mjs';
import MainContainer      from '../../../../../../../apps/portal/view/home/MainContainer.mjs';

const
    currentDir        = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot          = path.resolve(currentDir, '../../../../../../../'),
    readmePath        = path.join(repoRoot, 'README.md'),
    learnTreePath     = path.join(repoRoot, 'learn/tree.json'),
    introDocPath      = path.join(repoRoot, 'learn/benefits/Introduction.md'),
    bigDataExampleDoc = path.join(repoRoot, 'examples/grid/bigData/index.html');

/**
 * Collects all text leaves across a Neo VDOM subtree (expanding child component references) in document order.
 * @param {Object|null} node
 * @param {String[]} [bucket=[]]
 * @returns {String[]}
 */
function collectVdomText(node, bucket=[]) {
    if (!node) {
        return bucket
    }

    if (node.componentId) {
        return collectVdomText(InstanceManager.get(node.componentId)?.vdom, bucket)
    }

    if (typeof node.text === 'string' && node.text.trim()) {
        bucket.push(node.text.trim())
    }

    if (Array.isArray(node.cn)) {
        for (const child of node.cn) {
            collectVdomText(child, bucket)
        }
    }

    return bucket
}

/**
 * Finds VDOM nodes matching a predicate across a Neo VDOM subtree in document order.
 * @param {Object|null} node
 * @param {Function} predicate
 * @param {Object[]} [matches=[]]
 * @returns {Object[]}
 */
function findVdomNodes(node, predicate, matches=[]) {
    if (!node) {
        return matches
    }

    if (node.componentId) {
        return findVdomNodes(InstanceManager.get(node.componentId)?.vdom, predicate, matches)
    }

    if (predicate(node)) {
        matches.push(node)
    }

    if (Array.isArray(node.cn)) {
        for (const child of node.cn) {
            findVdomNodes(child, predicate, matches)
        }
    }

    return matches
}

test.describe('Portal.view.home.parts.AudienceDoors', () => {
    test('mounts three glass-card audience doors in canonical Body -> Brain -> Organism order', async () => {
        const view = Neo.create(AudienceDoors, {appName});

        try {
            await view.initVnode();

            const
                doorRefs = ['door-build', 'door-agents', 'door-study'],
                doors    = doorRefs.map(ref => view.getItem(ref));

            expect(doors.every(Boolean)).toBe(true);
            expect(doors.every(door => door.cls.includes('portal-glass-card'))).toBe(true);

            const headlines = findVdomNodes(
                view.vdom,
                node => node.tag === 'h3' && node.cls?.includes('portal-content-box-headline')
            ).map(node => node.text);

            expect(headlines).toEqual([
                'Build an application',
                'Run an agent team',
                'Study the model'
            ])
        } finally {
            view.destroy()
        }
    });

    test('aligns Door 1 counts and quickstart with README.md and wires verified proof and guide destinations', async () => {
        const
            readmeSource = fs.readFileSync(readmePath, 'utf8'),
            bodyMatch    = readmeSource.match(/`(\d+)` classes across `(\d+)` namespaces/);

        expect(bodyMatch).not.toBeNull();
        expect(readmeSource).toContain('## Who This Is For');
        expect(readmeSource).toContain('## The Engine');
        expect(readmeSource).toContain('npx neo-app@latest');

        const [, classCount, namespaceCount] = bodyMatch;

        expect(AudienceDoors.resolveBigDataExampleUrl({
            basePath   : '../../',
            environment: 'development'
        })).toBe('../../examples/grid/bigData/index.html');

        expect(AudienceDoors.resolveBigDataExampleUrl({
            basePath   : '../../../../',
            environment: 'dist/production'
        })).toBe('../../../../dist/production/examples/grid/bigData/index.html');

        expect(AudienceDoors.resolveBigDataExampleUrl({
            basePath   : 'node_modules/neo.mjs/',
            environment: 'dist/production'
        })).toBe('/examples/grid/bigData/index.html');

        expect(AudienceDoors.resolveBigDataExampleUrl({})).toBe('/examples/grid/bigData/index.html');

        expect(AudienceDoors.resolveSectionAnchorUrl(null)).toBeNull();
        expect(AudienceDoors.resolveSectionAnchorUrl('neo-container-4', {
            basePath: '../../'
        })).toBe('#neo-container-4');
        expect(AudienceDoors.resolveSectionAnchorUrl('neo-container-4', {
            basePath: 'node_modules/neo.mjs/'
        })).toBe('/#neo-container-4');
        expect(AudienceDoors.resolveSectionAnchorUrl('neo-container-4', {})).toBe('/#neo-container-4');

        const view = Neo.create(AudienceDoors, {appName});

        try {
            await view.initVnode();

            const
                buildDoorText  = collectVdomText(view.getItem('door-build').vdom).join(' '),
                agentsDoorText = collectVdomText(view.getItem('door-agents').vdom).join(' '),
                studyDoorText  = collectVdomText(view.getItem('door-study').vdom).join(' '),
                proofAnchors   = findVdomNodes(
                    view.vdom,
                    node => node.tag === 'a' && !node.cls?.includes('neo-button')
                ),
                studyCta       = view.getItem('door-study-cta');

            expect(buildDoorText).toContain(`${classCount} classes across ${namespaceCount} namespaces`);
            expect(buildDoorText).toContain('$ npx neo-app@latest');
            expect(agentsDoorText).toContain('Agent Institution');
            expect(agentsDoorText).not.toContain('Fleet Manager');
            expect(agentsDoorText).toContain('neo-agent-brain · neo-agent-institution');
            expect(studyDoorText).toContain('MX · Two Hemispheres · Gated RSI');

            expect(proofAnchors).toHaveLength(3);
            expect(proofAnchors[0].href).toContain('examples/grid/bigData/index.html');
            expect(proofAnchors[0].target).toBe('_blank');
            expect(proofAnchors[0].rel).toBe('noopener noreferrer');
            expect(fs.existsSync(bigDataExampleDoc)).toBe(true);

            expect(proofAnchors[1].href).toBe('#/news/pulls/15123');
            expect(proofAnchors[2].href).toBe('#/learn/benefits/Introduction');

            expect(studyCta.route).toBe('/learn/benefits/Introduction');
            expect(studyCta.vdom.tag).toBe('a');
            expect(studyCta.vdom.href).toBe('#/learn/benefits/Introduction');
        } finally {
            view.destroy()
        }

        const
            treeData    = JSON.parse(fs.readFileSync(learnTreePath, 'utf8')).data,
            introRecord = treeData.find(record => record.id === 'benefits/Introduction');

        expect(introRecord).toBeTruthy();
        expect(introRecord.name).toBe('Introduction');
        expect(fs.existsSync(introDocPath)).toBe(true);
        expect(fs.statSync(introDocPath).size).toBeGreaterThan(0)
    });

    test('maintains zero verbatim sentence overlap with HeroContent value proposition', async () => {
        const
            heroSubHeader = HeroContent.config.items[2].vdom.cn.map(node => node.text).join(''),
            heroSentences = heroSubHeader
                .split(/(?<=[.!?])\s+/)
                .map(sentence => sentence.trim())
                .filter(Boolean);

        expect(heroSentences.length).toBeGreaterThanOrEqual(2);

        const view = Neo.create(AudienceDoors, {appName});

        try {
            await view.initVnode();

            const
                renderedPieces = collectVdomText(view.vdom),
                combinedCopy   = renderedPieces.join(' ');

            for (const heroSentence of heroSentences) {
                expect(combinedCopy).not.toContain(heroSentence);
                for (const piece of renderedPieces) {
                    expect(piece).not.toContain(heroSentence)
                }
            }
        } finally {
            view.destroy()
        }
    });

    test('wires MainContainer stage references without hardcoded index scrolling', async () => {
        const
            items        = MainContainer.config.items,
            doorsEntry   = items.find(item => item?.reference === 'home-audience-doors'),
            bodyEntry    = items.find(item => item?.reference === 'home-body-entry'),
            agentOsEntry = items.find(item => item?.reference === 'home-agent-os'),
            scrollSource = MainContainer.prototype.scrollToPart.toString();

        expect(doorsEntry?.module).toBe(AudienceDoors);
        expect(bodyEntry).toBeTruthy();
        expect(agentOsEntry).toBeTruthy();
        expect(items.indexOf(doorsEntry)).toBe(2);
        expect(scrollSource).toContain('getItem(reference)');
        expect(scrollSource).not.toMatch(/items\[\d+\]/);

        const
            preventDefaultCalls  = [],
            scrollCalls          = [],
            originalBasePath     = Neo.config.basePath,
            originalDomEvents    = Neo.main.DomEvents,
            originalScrollIntoVw = Neo.main.DomAccess.scrollIntoView;

        Neo.main.DomAccess.scrollIntoView = async payload => {
            scrollCalls.push(payload)
        };
        Neo.main.DomEvents = {
            ...originalDomEvents,
            registerPreventDefaultTargets(payload) {
                preventDefaultCalls.push(payload)
            }
        };

        const mockMain = Neo.create(MainContainer, {
            appName,
            items: [
                {module: AudienceDoors, reference: 'home-audience-doors'},
                {ntype: 'container',    reference: 'home-body-entry'},
                {ntype: 'container',    reference: 'home-agent-os'}
            ]
        });

        try {
            const
                doors     = mockMain.getItem('home-audience-doors'),
                bodyStage = mockMain.getItem('home-body-entry'),
                osStage   = mockMain.getItem('home-agent-os'),
                buildCta  = doors.getItem('door-build-cta'),
                agentsCta = doors.getItem('door-agents-cta');

            expect(buildCta.cls).toContain('portal-door-scroll-cta');
            expect(agentsCta.cls).toContain('portal-door-scroll-cta');
            expect(buildCta.vdom.tag).toBe('a');
            expect(buildCta.vdom.href).toBe(`#${bodyStage.id}`);
            expect(buildCta.vdom.target).toBeUndefined();
            expect(agentsCta.vdom.tag).toBe('a');
            expect(agentsCta.vdom.href).toBe(`#${osStage.id}`);
            expect(agentsCta.vdom.target).toBeUndefined();

            doors.mounted = true;
            expect(preventDefaultCalls).toEqual([{
                cls     : 'portal-door-scroll-cta',
                name    : 'click',
                windowId: doors.windowId
            }]);

            Neo.config.basePath = 'node_modules/neo.mjs/';
            doors.syncSectionTargets(mockMain);

            expect(buildCta.vdom.href).toBe(`/#${bodyStage.id}`);
            expect(buildCta.vdom.target).toBeUndefined();
            expect(agentsCta.vdom.href).toBe(`/#${osStage.id}`);
            expect(agentsCta.vdom.target).toBeUndefined();

            doors.onScrollToBodyEntry();
            doors.onScrollToAgentOs();

            expect(scrollCalls).toEqual([
                {behavior: 'smooth', block: 'start', id: bodyStage.id, windowId: mockMain.windowId},
                {behavior: 'smooth', block: 'start', id: osStage.id,   windowId: mockMain.windowId}
            ])
        } finally {
            Neo.config.basePath               = originalBasePath;
            Neo.main.DomEvents                = originalDomEvents;
            Neo.main.DomAccess.scrollIntoView = originalScrollIntoVw;
            mockMain.destroy()
        }
    })
});
