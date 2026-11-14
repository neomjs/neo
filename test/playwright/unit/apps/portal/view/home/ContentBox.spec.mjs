import {setup} from '../../../../../setup.mjs';

const appName = 'PortalHomeContentBoxTest';

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
import ContentBox         from '../../../../../../../apps/portal/view/home/ContentBox.mjs';
import Colors             from '../../../../../../../apps/portal/view/home/parts/Colors.mjs';
import HeaderToolbar      from '../../../../../../../apps/portal/view/HeaderToolbar.mjs';
import HeroContent        from '../../../../../../../apps/portal/view/home/parts/hero/Content.mjs';
import MainContainer      from '../../../../../../../apps/portal/view/home/MainContainer.mjs';

const brainDocUrl        = 'https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/MemoryCore.md',
      currentDir         = path.dirname(fileURLToPath(import.meta.url)),
      featureSectionScss = path.resolve(currentDir, '../../../../../../../resources/scss/src/apps/portal/home/FeatureSection.scss'),
      heroScssPath       = path.resolve(currentDir, '../../../../../../../resources/scss/src/apps/portal/home/parts/hero/Content.scss');

/**
 * Recursively collects vnodes matching `nodeName` across a rendered vnode tree.
 * @param {Object|null} node
 * @param {String} nodeName
 * @param {Object[]} [matches=[]]
 * @returns {Object[]}
 */
function collectVnodesByTag(node, nodeName, matches=[]) {
    if (!node || typeof node !== 'object') {
        return matches
    }

    if (node.nodeName === nodeName) {
        matches.push(node)
    }

    if (Array.isArray(node.childNodes)) {
        node.childNodes.forEach(child => collectVnodesByTag(child, nodeName, matches))
    }

    return matches
}

test.describe('Portal.view.home.ContentBox', () => {
    test('an absolute URL opens in a new tab, and a hash route drops the target again', async () => {
        const box = Neo.create(ContentBox, {
            appName,
            header: 'Active Hybrid GraphRAG',
            route : brainDocUrl
        });

        const {vnode} = await box.initVnode();

        expect(vnode.attributes.href).toBe(brainDocUrl);
        expect(vnode.attributes.target).toBe('_blank');

        box.mounted = true;

        const {deltas} = await box.set({route: '#/learn/agentos/NeuralLink'});

        expect(deltas.find(delta => delta.id === box.id)?.attributes).toEqual({
            href  : '#/learn/agentos/NeuralLink',
            target: null
        });

        box.destroy()
    });

    test('hero GitHub secondary button parameterizes button CSS variables instead of overriding hover background-color', () => {
        const githubItem  = HeroContent.config.items[3].items.find(item => item.cls?.includes('neo-github')),
              scssSource  = fs.readFileSync(heroScssPath, 'utf8'),
              githubBlock = scssSource.match(/\.neo-github\s*\{([^}]*)\}/)?.[1] ?? '';

        expect(githubItem.ui).toBe('secondary');
        expect(githubBlock).toContain('--button-secondary-background-color: var(--sem-color-bg-neutral-highlighted)');
        expect(githubBlock).toContain('--button-secondary-text-color      : var(--sem-color-text-neutral-default)');
        expect(githubBlock).not.toMatch(/(?:^|\s)background-color\s*:/)
    });

    test('Home MainContainer renders a single <h1> ("Neo.mjs") while preserving .neo-h1/.neo-h2 styling and internal MultiWindow CTA (#20917)', async () => {
        const originalMonacoAddon = Neo.main?.addon?.MonacoEditor;
        Neo.ns('Neo.main.addon', true).MonacoEditor = {destroyInstance: () => {}};

        const home = Neo.create(MainContainer, {appName});

        try {
            const {vnode} = await home.initVnode();
            const h1Nodes = collectVnodesByTag(vnode, 'h1');
            const h2Nodes = collectVnodesByTag(vnode, 'h2');
            const h3Nodes = collectVnodesByTag(vnode, 'h3');

            expect(h1Nodes).toHaveLength(1);
            expect(h1Nodes[0].textContent).toBe('Neo.mjs');
            expect(h1Nodes[0].className).toContain('neo-h1');

            const h2Texts = h2Nodes.map(node => node.textContent);
            expect(h2Texts).toEqual(expect.arrayContaining([
                'Amazing Potential',
                'Extreme Speed',
                'How?',
                'The Agent OS Brain'
            ]));

            for (const headline of ['Amazing Potential', 'Extreme Speed', 'How?', 'The Agent OS Brain']) {
                const headingNode = h2Nodes.find(node => node.textContent === headline);
                expect(headingNode?.className).toContain('neo-h1');
            }

            for (const subHeadline of ['Shared Socket Data', '40,000 Updates /s', 'How does Neo.mjs do it?']) {
                const subNode = h3Nodes.find(node => node.textContent === subHeadline);
                expect(subNode?.className).toContain('neo-h2');
            }

            const featureScssSource = fs.readFileSync(featureSectionScss, 'utf8');
            expect(featureScssSource).not.toContain('h1.neo-h1');
            expect(featureScssSource).not.toContain('h2.neo-h2');
            expect(featureScssSource).toContain('.neo-h1 {');
            expect(featureScssSource).toContain('.neo-h2 {');

            expect(Colors.config.learnMoreRoute).toBe('#/learn/benefits/body/MultiWindow');
            expect(Colors.config.learnMoreRoute).not.toContain('itnext.io');

            const colorsSection   = home.items.find(item => item.className === 'Portal.view.home.parts.Colors');
            const learnMoreButton = colorsSection.getItem('learn-more-button');
            expect(learnMoreButton.route).toBe('#/learn/benefits/body/MultiWindow');
            expect(learnMoreButton.vdom.href).toBe('#/learn/benefits/body/MultiWindow');
        } finally {
            home.destroy();
            if (originalMonacoAddon === undefined) {
                delete Neo.main.addon.MonacoEditor
            } else {
                Neo.main.addon.MonacoEditor = originalMonacoAddon
            }
        }
    });

    test('HeaderToolbar home-button links to #/ and ViewportController routes both / and /home to onHomeRoute (#20917)', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch    = async () => ({ok: true, json: async () => ({})});

        const toolbar = Neo.create(HeaderToolbar, {appName});

        try {
            const {default: ViewportController} = await import('../../../../../../../apps/portal/view/ViewportController.mjs');
            const {vnode}                       = await toolbar.initVnode();
            const homeButton                    = toolbar.getItem('home-button');

            expect(homeButton.route).toBe('/');
            expect(homeButton.vdom.tag).toBe('a');
            expect(homeButton.vdom.href).toBe('#/');
            expect(vnode).toBeTruthy();

            expect(ViewportController.config.routes['/']).toBe('onHomeRoute');
            expect(ViewportController.config.routes['/home']).toBe('onHomeRoute');
            expect(ViewportController.config.defaultHash).toBe('/home');
        } finally {
            globalThis.fetch = originalFetch;
            toolbar.destroy()
        }
    });
});
