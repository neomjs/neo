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
