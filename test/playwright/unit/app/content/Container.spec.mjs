import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ContentDomOrderTest'}});

import {test, expect} from '@playwright/test';
import Neo from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';
import Container from '../../../../../src/app/content/Container.mjs';
import PageContainer from '../../../../../src/app/content/PageContainer.mjs';
import Content from '../../../../../src/app/content/Component.mjs';
import Provider from '../../../../../src/state/Provider.mjs';
import Store from '../../../../../src/data/Store.mjs';

test('content uses a main landmark and comes before navigation', async () => {
    const container = Neo.create(Container, {
        appName: 'ContentDomOrderTest',
        stateProvider: {
            module: Provider,
            data: {size: 'large', countSections: 0},
            stores: {sections: {module: Store, data: []}}
        },
        treeConfig: {bind: null},
        pageContainerConfig: {bind: null, contentConfig: {module: Content, bind: null}}
    });

    try {
        await container.initVnode();
        const page = container.items.find(item => item instanceof PageContainer),
              sidebar = container.getReference('sidenav-container'),
              splitter = container.items.find(item => item.cls.includes('main-content-splitter'));

        expect(page.tag).toBe('main');
        expect(page.getReference('content').tag).toBe('article');
        expect(container.items.indexOf(page)).toBeLessThan(container.items.indexOf(sidebar));
        expect(page.vdom.tag).toBe('main');
        expect(splitter.getResizeSibling()).toBe(sidebar);
        expect(splitter.getOppositeSibling()).toBe(page);
        expect(splitter.getResizeConfig().resizeNext).toBe(false);
    } finally {
        container.destroy();
    }
});
