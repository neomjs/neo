import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect, test}  from '../../fixtures.mjs';

/**
 * @summary Exercises mixin selection against the actual generated Docs data and the live App worker.
 */
test.describe('Docs mixin members', () => {
    test.use({viewport: {width: 1400, height: 950}});

    test.beforeAll(() => {
        execFileSync(process.execPath, ['buildScripts/docs/generateDocsJson.mjs'], {
            cwd    : fileURLToPath(new URL('../../../../', import.meta.url)),
            timeout: 60000
        })
    });

    test('keeps app source routes independent of the active navigation tab and search', async ({page, neuralLink}) => {
        let structureRequests = 0;
        page.on('request', request => {
            if (new URL(request.url()).pathname === '/docs/output/structure.json') structureRequests++
        });
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/docs/index.html');
        const app = await neuralLink.connectToApp('Docs'), className = 'Docs.app.view.MainContainer';
        let apiTree, appsTree, record;

        await expect.poll(async () => {
            [apiTree] = await app.queryComponent({reference: 'api-treelist'}, ['store.id']);
            [appsTree] = await app.queryComponent({reference: 'apps-treelist'}, ['store.id']);
            if (appsTree) {
                [record] = await app.callMethod(appsTree.properties['store.id'], 'find', [{className}])
            }
            return !!record
        }).toBe(true);

        expect(await app.callMethod(apiTree.properties['store.id'], 'find', [{className}])).toEqual([]);
        expect(structureRequests).toBe(1);
        const navigation = page.locator('.neo-docs-navigation-tab-container'),
              apiTab     = navigation.getByRole('tab', {name: 'API', exact: true}),
              appsTab    = navigation.getByRole('tab', {name: 'Apps', exact: true}),
              [view]     = await app.queryComponent({className: 'Docs.view.MainContainer'}, ['controller.id']),
              openSource = lineNumber => app.callMethod(view.properties['controller.id'], 'onViewSourceRoute', [{className, lineNumber}]);

        await expect(apiTab).toHaveAttribute('aria-selected', 'true');
        await openSource('1');
        let sourceView;
        await expect.poll(async () => {
            [sourceView] = await app.queryComponent({id: `${className}__source`}, ['line']);
            return !!sourceView
        }).toBe(true);
        await expect(page.locator(`[id="${sourceView.id}"]`)).toContainText('class MainContainer extends Viewport');
        await expect(apiTab).toHaveAttribute('aria-selected', 'true');

        await page.locator('input[placeholder="Filter Navigation"]').fill('Store');
        await openSource('20');
        await expect.poll(async () => (await app.getComponent(sourceView.id, ['line'])).line).toBe(20);
        await appsTab.click();
        const leafId = await app.callMethod(appsTree.id, 'getItemId', [record.id]);
        await expect(page.locator(`[id="${leafId}"]`)).toBeHidden();
        await page.locator('input[placeholder="Filter Navigation"]').fill('MainContainer');
        await expect(page.locator(`[id="${leafId}"]`)).toBeVisible();
        await page.locator(`[id="${leafId}"]`).click();
        await expect.poll(async () => (await app.queryComponent({id: className}, ['structureData.className'])).length).toBe(1);
        await page.screenshot({path: test.info().outputPath('docs-apps-navigation.png')})
    });


    test('a line request delivered after its source tab leaves ignores the removed leaf (#20869)', async ({page, neuralLink}, testInfo) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/docs/index.html');
        const app      = await neuralLink.connectToApp('Docs'), className = 'Docs.app.view.MainContainer',
              sourceId = `${className}__source`, source = page.locator(`[id="${sourceId}"]`);
        let controllerId, receipt;

        await expect.poll(async () => {
            const [view] = await app.queryComponent({className: 'Docs.view.MainContainer'}, ['controller.id']);
            controllerId = view?.properties['controller.id'];
            return Boolean(controllerId)
        }).toBe(true);
        const openSource = lineNumber => app.callMethod(controllerId, 'onViewSourceRoute', [{className, lineNumber}]);

        await openSource('1');
        try {
            await expect(source.locator('[data-line-number="1"]').first().locator('..')).toHaveClass(/neo-highlighted-line/)
        } catch (error) {
            // Read only after the original assertion failed: collecting readiness must not change its ordering.
            const [main, component] = await Promise.all([
                page.evaluate(id => {
                    const view  = document.getElementById(id), code = view?.querySelector('pre code'),
                          addon = Neo.main.addon.HighlightJS, highlighter = globalThis.hljs;
                    return {
                        at                  : Date.now(), viewPresent: Boolean(view), codeId: code?.id ?? null,
                        textLength          : code?.textContent.length ?? null, codeClass: code?.className ?? null,
                        highlightedAttribute: code?.getAttribute('data-highlighted') ?? null,
                        lineNumbers         : code?.querySelectorAll('[data-line-number]').length ?? 0,
                        addonReady          : addon?.isReady ?? null,
                        highlightBlock      : typeof highlighter?.highlightBlock,
                        lineNumbersBlock    : typeof highlighter?.lineNumbersBlock,
                        lineNumbersBlockSync: typeof highlighter?.lineNumbersBlockSync
                    }
                }, sourceId).catch(failure => ({diagnosticError: String(failure)})),
                app.getComponent(sourceId, ['mounted', 'vnodeInitialized', 'isVnodeInitializing', 'isVdomUpdating',
                    'needsVdomUpdate', 'isHighlighted', 'line', 'vdom.cn.0.cn.0.id'])
                    .then(state => ({at: Date.now(), state}), failure => ({diagnosticError: String(failure)}))
            ]);
            await testInfo.attach('initial-source-readiness.json', {
                body: JSON.stringify({sourceId, main, component}), contentType: 'application/json'
            }).catch(failure => console.warn('Could not attach initial source readiness:', failure));
            throw error
        }
        const codeId = await source.locator('pre code').getAttribute('id');
        expect(codeId).toBeTruthy();

        await page.evaluate(vnodeId => {
            const addon   = Neo.main.addon.HighlightJS, original = addon.syntaxHighlightLine,
                  witness = window.__docsLateLine = {captured: [], executed: [], releases: [], holding: true};
            addon.syntaxHighlightLine = function(data) {
                if (!witness.holding || data.vnodeId !== vnodeId || data.addLine !== 20) {
                    return original.apply(this, arguments)
                }
                witness.captured.push({vnodeId: data.vnodeId, present: Boolean(document.getElementById(data.vnodeId))});
                return new Promise(resolve => witness.releases.push(resolve)).then(() => {
                    witness.executed.push({vnodeId: data.vnodeId, present: Boolean(document.getElementById(data.vnodeId))});
                    return original.call(this, data)
                })
            };
            witness.release = () => {witness.holding = false; witness.releases.splice(0).forEach(resolve => resolve())};
            witness.restore = () => {witness.release(); addon.syntaxHighlightLine = original};
            witness.read = () => ({captured: witness.captured, executed: witness.executed, pending: witness.releases.length})
        }, codeId);

        try {
            await openSource('20');
            await expect.poll(() => page.evaluate(() => window.__docsLateLine.captured.length)).toBeGreaterThan(0);
            expect(await page.evaluate(() => window.__docsLateLine.captured.every(call => call.present))).toBe(true);

            // The real class route activates another card; the normal layout removes inactive source DOM.
            await app.callMethod(controllerId, 'onViewClassRoute', [{className}]);
            await expect(source).toHaveCount(0);
            expect(await page.evaluate(id => document.getElementById(id) === null, codeId)).toBe(true);
            await page.evaluate(() => window.__docsLateLine.release());
            await expect.poll(() => page.evaluate(() => {
                const witness = window.__docsLateLine;
                return witness.executed.length === witness.captured.length
            })).toBe(true);
            receipt = await page.evaluate(() => window.__docsLateLine.read());
            expect(receipt.executed.every(call => !call.present)).toBe(true);
            expect(receipt.pending).toBe(0);

            // Reactivating the same retained view must still highlight a current line normally.
            await openSource('2');
            await expect(source.locator('[data-line-number="2"]').first().locator('..')).toHaveClass(/neo-highlighted-line/);
            expect(await page.evaluate(() => window.__docsLateLine.read())).toEqual(receipt)
        } finally {
            receipt ||= await page.evaluate(() => window.__docsLateLine.read());
            await page.evaluate(() => {
                window.__docsLateLine.restore();
                delete window.__docsLateLine
            });
            await testInfo.attach('late-source-line.json', {body: JSON.stringify(receipt), contentType: 'application/json'})
        }
    });

    test('Store exposes Observable through one toggle, filters its members, and opens their source', async ({page, neuralLink}) => {
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/docs/index.html');
        const app = await neuralLink.connectToApp('Docs');
        let navigation, record;

        await expect.poll(async () => {
            [navigation] = await app.queryComponent({reference: 'api-treelist'}, ['store.id']);
            if (navigation) {
                [record] = await app.callMethod(navigation.properties['store.id'], 'find', [{className: 'Neo.data.Store'}])
            }
            return !!record
        }).toBe(true);

        await page.locator('input[placeholder="Filter Navigation"]').fill('Store');
        const navigationId = await app.callMethod(navigation.id, 'getItemId', [record.id]);
        await page.locator(`[id="${navigationId}"]`).click();

        let hierarchy, members;
        await expect.poll(async () => {
            [hierarchy] = await app.queryComponent({className: 'Docs.view.classdetails.HierarchyTreeList'}, ['store.items']);
            [members] = await app.queryComponent({className: 'Docs.view.classdetails.MembersList'}, ['store.id', 'targetClassName']);
            return !!hierarchy && !!members
        }).toBe(true);

        const sources     = hierarchy.properties['store.items'],
              providers   = sources.filter(source => source.isMixin && source.sourceClassName === 'Neo.core.Observable'),
              memberStore = members.properties['store.id'];

        expect(providers).toHaveLength(1);
        expect(providers[0].checked).toBe(true);
        expect(sources.filter(source => !source.isMixin && source.sourceClassName !== 'Neo.data.Store')
            .every(source => !source.checked)).toBe(true);
        expect(members.properties.targetClassName).toBe('Neo.data.Store');

        const supplied = async () => (await app.callMethod(memberStore, 'find', [{neoClassName: 'Neo.core.Observable'}]))
            .map(member => member.name).sort(),
              before = await supplied(),
              mixinId = await app.callMethod(hierarchy.id, 'getItemId', [providers[0].id]),
              toggle = page.locator(`[id="${mixinId}"]`);

        expect(before).toContain('on');
        expect(before).toContain('fire');
        await expect(toggle).toContainText('Neo.core.Observable (mixin)');
        await toggle.click();
        await expect.poll(supplied).toEqual([]);
        await expect(toggle).toHaveClass(/unchecked/);
        expect((await app.getComponent(members.id, ['targetClassName'])).targetClassName).toBe('Neo.data.Store');

        await toggle.click();
        await expect.poll(supplied).toEqual(before);
        await expect(toggle).not.toHaveClass(/unchecked/);
        await page.locator('input[placeholder="Filter Members"]').fill('fire');
        await expect.poll(supplied).toEqual(['fire']);

        const source = page.locator('.docs-classhierarchy-memberslist .neo-docs-view-source-link')
            .filter({hasText: 'core/Observable.mjs'});
        await expect(source).toHaveCount(1);
        await expect(source).toHaveText(/Source: src\/core\/Observable\.mjs \(Line \d+\)/);
        await expect(source.locator('..').locator('..')).toContainText('mixin');
        await page.screenshot({path: test.info().outputPath('docs-store-mixins.png')});
        await source.click();

        let sourceView;
        await expect.poll(async () => {
            const views = await app.queryComponent({className: 'Docs.view.classdetails.SourceViewComponent'}, ['structureData.className']);
            sourceView = views.find(view => view.properties['structureData.className'] === 'Neo.core.Observable');
            return !!sourceView
        }).toBe(true);
        await expect(page.locator(`[id="${sourceView.id}"]`)).toContainText('class Observable extends Base')
    });
});
