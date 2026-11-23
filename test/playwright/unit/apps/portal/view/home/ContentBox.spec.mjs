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

import {test, expect}                     from '@playwright/test';
import fs                                 from 'node:fs';
import path                               from 'node:path';
import {fileURLToPath}                    from 'node:url';
import {EXAMPLES_DIR, readExampleCatalog} from '../../../../../../../buildScripts/util/exampleCatalog.mjs';
import Neo                                from '../../../../../../../src/Neo.mjs';
import * as core                          from '../../../../../../../src/core/_export.mjs';
import InstanceManager                    from '../../../../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator                 from '../../../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper                         from '../../../../../../../src/vdom/Helper.mjs';
import ContentBox                         from '../../../../../../../apps/portal/view/home/ContentBox.mjs';
import MemberContainer                    from '../../../../../../../apps/portal/view/about/MemberContainer.mjs';
import Example                            from '../../../../../../../apps/portal/model/Example.mjs';
import ExamplesContainer                  from '../../../../../../../apps/portal/view/examples/MainContainer.mjs';
import Grid                               from '../../../../../../../apps/portal/view/home/parts/Grid.mjs';
import HeaderToolbar                      from '../../../../../../../apps/portal/view/HeaderToolbar.mjs';
import HeroContent                        from '../../../../../../../apps/portal/view/home/parts/hero/Content.mjs';
import MainContainer                      from '../../../../../../../apps/portal/view/home/MainContainer.mjs';
import Planning                           from '../../../../../../../apps/portal/view/home/parts/Planning.mjs';

const brainDocUrl       = 'https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/MemoryCore.md',
      currentDir        = path.dirname(fileURLToPath(import.meta.url)),
      examplesDir       = path.resolve(currentDir, '../../../../../../../', EXAMPLES_DIR),
      featureSectionCss = path.resolve(currentDir, '../../../../../../../resources/css/src/apps/portal/home/FeatureSection.css'),
      heroCssPath       = path.resolve(currentDir, '../../../../../../../resources/css/src/apps/portal/home/parts/hero/Content.css'),
      memberCssPath     = path.resolve(currentDir, '../../../../../../../resources/css/src/apps/portal/about/MemberContainer.css'),
      viewportCssPath   = path.resolve(currentDir, '../../../../../../../resources/css/src/apps/portal/Viewport.css');

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

    test('hero audience cue is a secondary button that parameterizes button CSS variables instead of overriding hover background-color', () => {
        const cueItem   = HeroContent.config.items[3].items.find(item => item.cls?.includes('hero-audience-cue')),
              cssSource = fs.readFileSync(heroCssPath, 'utf8'),
              cueBlock  = cssSource.match(/\.hero-audience-cue\s*\{([^}]*)\}/)?.[1] ?? '';

        expect(cueItem.ui).toBe('secondary');
        expect(cueItem.handler).toBe('up.onScrollToAudience');
        expect(cueItem.iconCls).toBe('fa fa-arrow-down');
        expect(cueItem.iconPosition).toBe('right');
        expect(cueItem.url).toBeUndefined();
        expect(cueBlock).toContain('--button-secondary-background-color: var(--sem-color-bg-neutral-highlighted)');
        expect(cueBlock).toContain('--button-secondary-text-color      : var(--sem-color-text-neutral-default)');
        expect(cueBlock).not.toMatch(/(?:^|\s)background-color\s*:/)
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
                'Data Grid',
                'Gantt & Task Board',
                'How?',
                'The Agent OS Brain'
            ]));

            for (const headline of ['Data Grid', 'Gantt & Task Board', 'How?', 'The Agent OS Brain']) {
                const headingNode = h2Nodes.find(node => node.textContent === headline);
                expect(headingNode?.className).toContain('neo-h1');
            }

            for (const subHeadline of [Grid.config.subHeadline, Planning.config.subHeadline, 'How does Neo.mjs do it?']) {
                const subNode = h3Nodes.find(node => node.textContent === subHeadline);
                expect(subNode?.className).toContain('neo-h2');
            }

            // Each sub-headline counts its own snippet; the grid's feed writes records (including demand) and measures its own rate
            expect(Grid.config.subHeadline).toBe(`Live Data · ${Grid.config.livePreviewCode.split('\n').length} Lines of Code`);
            expect(Planning.config.subHeadline).toBe(`One Store · ${Planning.config.livePreviewCode.split('\n').length} Lines of Code`);
            expect(Grid.config.livePreviewCode).toContain('record.set({price, trend, change: price - record.open, demand})');
            expect(Grid.config.livePreviewCode).toContain('done * 1000 / (Date.now() - since)');

            // The planning page binds one store to both of its views, and comes first
            expect(Planning.config.livePreviewCode.match(/bind: \{store: 'stores\.plan'\}/g)).toHaveLength(2);
            expect(home.getItem('home-body-entry').className).toBe('Portal.view.home.parts.Planning');

            // The card selected at rest and the bar highlighted at rest are one task
            const [, highlightedBar] = Planning.config.livePreviewCode.match(/highlightedRecordIds: \['(\d+)'\]/),
                  [, selectedCard]   = Planning.config.livePreviewCode.match(/selectionModel: \{items: \['(\d+)'\]\}/);

            expect(highlightedBar).toBe(selectedCard);

            // Both snippets build from engine classes alone, stay short, and end on the class they export
            for (const part of [Grid, Planning]) {
                const lines   = part.config.livePreviewCode.split('\n'),
                      imports = lines.filter(line => line.startsWith('import '));

                expect(imports.length).toBeGreaterThan(0);
                imports.forEach(line => expect(line).toMatch(/ from '\.\.\/[a-z]+\/[A-Za-z]+\.mjs';$/));

                expect(lines.length).toBeLessThanOrEqual(48);
                expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(91);
                expect(lines.at(-1)).toBe('export default Neo.setupClass(MainView);')
            }

            // Every link names an examples group that shows at least one card in the production build
            const {records: catalog} = await readExampleCatalog(examplesDir);

            for (const part of [Grid, Planning]) {
                part.config.links.forEach(({route}) => {
                    const group = ExamplesContainer.config.familyDefinitions.find(definition => `#${definition.route}` === route);

                    expect(group, `${route} names no examples group`).toBeTruthy();
                    expect(catalog.some(record => (record.family === group.family || record.alsoIn?.includes(group.family)) &&
                        Example.publishes(record, 'dist_prod')), `${route} shows no card in dist_prod`).toBe(true)
                })
            }

            const featureCssSource = fs.readFileSync(featureSectionCss, 'utf8');
            expect(featureCssSource).not.toContain('h1.neo-h1');
            expect(featureCssSource).not.toContain('h2.neo-h2');
            expect(featureCssSource).toContain('.neo-h1 {');
            expect(featureCssSource).toContain('.neo-h2 {');

            expect(Grid.config.learnMoreRoute).toBe('#/learn/guides/datahandling/Grids');
            expect(Grid.config.learnMoreRoute).not.toContain('itnext.io');

            const gridSection     = home.items.find(item => item.className === 'Portal.view.home.parts.Grid');
            const learnMoreButton = gridSection.getItem('learn-more-button');
            expect(learnMoreButton.route).toBe('#/learn/guides/datahandling/Grids');
            expect(learnMoreButton.vdom.href).toBe('#/learn/guides/datahandling/Grids');

            // A component page's button names its guide; a page without its own text keeps the default
            const buttonText = part => home.items.find(item => item.className === `Portal.view.home.parts.${part}`).getItem('learn-more-button').text;

            expect(buttonText('Grid')).toBe('The grid guide');
            expect(buttonText('Planning')).toBe('The Gantt guide');
            expect(buttonText('How')).toBe('Learn more');

            // A component page opens on its source, runs nothing before its page is the active one, and names
            // the other families as routes
            const livePreview = gridSection.getReference('live-preview'),
                  links       = gridSection.getItem('links').items.filter(item => item.route);

            expect(livePreview.activeView).toBe('source');
            expect(livePreview.getPreviewContainer().items).toHaveLength(0);
            expect(links.map(link => link.route)).toEqual(Grid.config.links.map(link => link.route));
            links.forEach(link => expect(link.route).toMatch(/^#\/examples\/[a-z-]+$/));
        } finally {
            home.destroy();
            if (originalMonacoAddon === undefined) {
                delete Neo.main.addon.MonacoEditor
            } else {
                Neo.main.addon.MonacoEditor = originalMonacoAddon
            }
        }
    });

    test('Home and About member cards carry the shared glass card chrome while .portal-content-box stays layout-only (#22063)', () => {
        const box = Neo.create(ContentBox, {
            appName,
            header: 'Active Hybrid GraphRAG',
            route : brainDocUrl
        });

        expect(box.baseCls).toEqual(['portal-content-box', 'portal-glass-card']);
        expect(box.cls).toEqual(['portal-content-box', 'portal-glass-card']);

        // #/about-us keeps the card surface once .portal-content-box drops its legacy chrome
        expect(MemberContainer.config.cls).toEqual(['portal-about-member-container', 'portal-content-box', 'portal-glass-card']);

        const viewportCss = fs.readFileSync(viewportCssPath, 'utf8'),
              memberCss   = fs.readFileSync(memberCssPath, 'utf8'),
              contentBox  = viewportCss.match(/\.portal-content-box\s*\{[\s\S]*?\n    \}/)?.[0] ?? '';

        // Grid layout + link reset only: no surface chrome, and a card never moves
        expect(contentBox).toContain('display        : flex');
        expect(contentBox).toContain('min-height     : 300px');
        expect(contentBox).toContain('text-decoration: none');
        expect(contentBox).not.toContain('background-color');
        expect(contentBox).not.toContain('border-radius');
        expect(contentBox).not.toContain('translateY');
        expect(contentBox).not.toContain('scale(0.99)');
        expect(contentBox).not.toContain('cursor');

        // Only a real link keeps the pointer
        expect(viewportCss).toContain('a.portal-content-box');

        // A hover and a keyboard focus light a glass card identically
        expect(viewportCss).toMatch(/&:hover,\s*&:focus-visible,\s*&:has\(:focus-visible\)/);

        // #/about-us keeps its centered column: the standalone glass card sizing, not the grid override
        expect(memberCss).toContain('cursor       : default');
        expect(memberCss).toContain('margin-left  : auto');
        expect(memberCss).toContain('margin-right : auto');
        expect(memberCss).toContain('max-width    : 800px');

        box.destroy()
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
