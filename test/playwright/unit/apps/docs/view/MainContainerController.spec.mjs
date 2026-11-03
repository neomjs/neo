import {setup} from '../../../../setup.mjs';

const appName = 'DocsMainContainerControllerTest';

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

import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import Collection              from '../../../../../../src/collection/Base.mjs';
import Component               from '../../../../../../src/component/Base.mjs';
import Container               from '../../../../../../src/container/Base.mjs';
import Tooltip                 from '../../../../../../src/tooltip/Base.mjs';
import ContentTabContainer     from '../../../../../../docs/app/view/ContentTabContainer.mjs';
import MainContainerController from '../../../../../../docs/app/view/MainContainerController.mjs';

if (!Neo.ntypeMap['classdetails-maincontainer']) {
    class MockClassDetailsMainContainer extends Container {
        static config = {
            className    : 'Test.Unit.Docs.MockClassDetailsMainContainer',
            ntype        : 'classdetails-maincontainer',
            structureData: null
        }
    }
    Neo.setupClass(MockClassDetailsMainContainer);
}

class MockTabSourceViewComponent extends Component {
    static config = {
        className    : 'Test.Unit.Docs.MainContainerController.MockTabSourceViewComponent',
        ntype        : 'classdetails-sourceviewcomponent',
        line_        : null,
        structureData: null
    }
}
MockTabSourceViewComponent = Neo.setupClass(MockTabSourceViewComponent);

class MockTreeList extends Component {
    static config = {
        className: 'Test.Unit.Docs.MainContainerController.MockTreeList',
        store    : null
    }
}
MockTreeList = Neo.setupClass(MockTreeList);

test.describe('Docs.view.MainContainerController tab header tooltips', () => {
    test('sets full className and dot-joined example path tooltips on tab header buttons when opening API, Example, and Source tabs', async () => {
        Neo.main ??= {};
        Neo.main.addon ??= {};
        Neo.main.addon.HighlightJS ??= {
            loadFiles          : () => {},
            syntaxHighlightInit: () => {}
        };

        const apiStore = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [
                {
                    id       : 'api-button-base',
                    name     : 'Base',
                    className: 'Neo.button.Base',
                    singleton: false
                },
                {
                    id       : 'api-component-base',
                    name     : 'Base',
                    className: 'Neo.component.Base',
                    singleton: false
                }
            ]
        });

        const examplesStore = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [
                {
                    id      : 1,
                    parentId: null,
                    name    : 'Configuration'
                },
                {
                    id      : 2,
                    parentId: 1,
                    name    : 'button'
                },
                {
                    id      : 3,
                    parentId: 2,
                    name    : 'Base',
                    path    : '../../../src/container/Base.mjs'
                },
                {
                    id      : 4,
                    parentId: 2,
                    name    : 'Multi',
                    path    : ['../../../src/container/Base.mjs']
                }
            ]
        });

        const rootContainer = Neo.create(Container, {
            appName,
            controller: MainContainerController,
            items     : [
                {
                    module   : MockTreeList,
                    reference: 'api-treelist',
                    store    : apiStore
                },
                {
                    module   : MockTreeList,
                    reference: 'examples-treelist',
                    store    : examplesStore
                },
                {
                    module   : ContentTabContainer,
                    reference: 'content-tabcontainer',
                    sortable : false
                }
            ]
        });

        const
            controller          = rootContainer.controller,
            contentTabContainer = controller.getReference('content-tabcontainer'),
            tabBar              = contentTabContainer.getTabBar(),
            buttonApiRecord     = apiStore.get('api-button-base'),
            componentApiRecord  = apiStore.get('api-component-base'),
            exampleLeafRecord   = examplesStore.get(3),
            multiExampleRecord  = examplesStore.get(4);

        // 1. Opening two API tabs with the same leaf name ('Base') assigns distinct full className tooltips
        controller.onApiListLeafClick(buttonApiRecord);
        controller.onApiListLeafClick(componentApiRecord);

        const
            buttonApiTabButton    = tabBar.items[1],
            componentApiTabButton = tabBar.items[2];

        expect(buttonApiTabButton.text).toBe('Base');
        expect(buttonApiTabButton._tooltip).toEqual({text: 'Neo.button.Base'});
        expect(buttonApiTabButton.cls).toContain('neo-uses-shared-tooltip');

        expect(componentApiTabButton.text).toBe('Base');
        expect(componentApiTabButton._tooltip).toEqual({text: 'Neo.component.Base'});
        expect(componentApiTabButton.cls).toContain('neo-uses-shared-tooltip');

        // 2. Opening single-path and array-path Examples leaves assigns the dot-joined ancestry path as the tab header tooltip
        controller.onExamplesListLeafClick(exampleLeafRecord);
        controller.onExamplesListLeafClick(multiExampleRecord);

        await expect.poll(() => tabBar.items.length).toBe(5);

        const
            exampleTabButton      = tabBar.items[3],
            multiExampleTabButton = tabBar.items[4];

        expect(exampleTabButton.text).toBe('Base');
        expect(exampleTabButton._tooltip).toEqual({text: 'Configuration.button.Base'});
        expect(exampleTabButton.cls).toContain('neo-uses-shared-tooltip');

        expect(multiExampleTabButton.text).toBe('Multi');
        expect(multiExampleTabButton._tooltip).toEqual({text: 'Configuration.button.Multi'});
        expect(multiExampleTabButton.cls).toContain('neo-uses-shared-tooltip');

        // 3. Navigating to /viewSource assigns the full className as the source tab header tooltip
        controller.onViewSourceRoute({
            className : 'Neo.button.Base',
            lineNumber: '25'
        });

        const sourceTabButton = tabBar.items[5];

        expect(sourceTabButton.text).toBe('Base');
        expect(sourceTabButton._tooltip).toEqual({text: 'Neo.button.Base'});
        expect(sourceTabButton.cls).toContain('neo-uses-shared-tooltip');

        rootContainer.destroy();
        apiStore.destroy();
        examplesStore.destroy();
    });
});
