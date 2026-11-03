import {setup} from '../../../../../setup.mjs';

const appName = 'DocsHierarchyTreeListTest';

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

import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../../src/core/_export.mjs';
import InstanceManager               from '../../../../../../../src/manager/Instance.mjs';
import Collection                    from '../../../../../../../src/collection/Base.mjs';
import Container                     from '../../../../../../../src/container/Base.mjs';
import HierarchyTreeList             from '../../../../../../../docs/app/view/classdetails/HierarchyTreeList.mjs';
import MembersList                   from '../../../../../../../docs/app/view/classdetails/MembersList.mjs';
import MockClassDetailsMainContainer from '../../MockClassDetailsMainContainer.mjs';

class MockDocsMainContainer extends Container {
    static config = {
        className: 'Test.Unit.Docs.MockDocsMainContainer',
        ntype    : 'main-container',
        store    : null
    }
}
MockDocsMainContainer = Neo.setupClass(MockDocsMainContainer);

test.describe('Docs.view.classdetails.HierarchyTreeList', () => {
    test('checks only the selected class by default, renders ancestors with unchecked cls, and filters MembersList to the selected class until an ancestor is toggled', async () => {
        Neo.main ??= {};
        Neo.main.addon ??= {};
        Neo.main.addon.HighlightJS ??= {
            syntaxHighlightInit: () => {}
        };

        const mainStore = Neo.create(Collection, {
            keyProperty: 'id',
            items      : [
                {
                    id          : 'class-base',
                    $kind       : 'class',
                    kind        : 'class',
                    name        : 'Base',
                    neoClassName: 'Neo.core.Base',
                    meta        : {filename: 'Base.mjs', lineno: 1, path: '/neo/src/core'}
                },
                {
                    id          : 'class-component',
                    $kind       : 'class',
                    kind        : 'class',
                    name        : 'Base',
                    neoClassName: 'Neo.component.Base',
                    augments    : ['Neo.core.Base'],
                    meta        : {filename: 'Base.mjs', lineno: 1, path: '/neo/src/component'}
                },
                {
                    id          : 'class-button',
                    $kind       : 'class',
                    kind        : 'class',
                    name        : 'Base',
                    neoClassName: 'Neo.button.Base',
                    augments    : ['Neo.component.Base'],
                    meta        : {filename: 'Base.mjs', lineno: 1, path: '/neo/src/button'}
                },
                {
                    id          : 'member-base-id',
                    $kind       : 'property',
                    kind        : 'member',
                    name        : 'id_',
                    neoClassName: 'Neo.core.Base',
                    meta        : {filename: 'Base.mjs', lineno: 10, path: '/neo/src/core'}
                },
                {
                    id          : 'member-component-cls',
                    $kind       : 'property',
                    kind        : 'member',
                    name        : 'cls_',
                    neoClassName: 'Neo.component.Base',
                    meta        : {filename: 'Base.mjs', lineno: 20, path: '/neo/src/component'}
                },
                {
                    id          : 'member-button-text',
                    $kind       : 'property',
                    kind        : 'member',
                    name        : 'text_',
                    neoClassName: 'Neo.button.Base',
                    meta        : {filename: 'Base.mjs', lineno: 30, path: '/neo/src/button'}
                }
            ]
        });

        const rootContainer = Neo.create(MockDocsMainContainer, {
            appName,
            store: mainStore,
            items: [{
                module: MockClassDetailsMainContainer,
                items : [{
                    module       : HierarchyTreeList,
                    structureData: {className: 'Neo.button.Base'}
                }, {
                    module: MembersList
                }]
            }]
        });

        const
            tree        = rootContainer.down('classhierarchy-treelist'),
            membersList = rootContainer.down('classdetails-memberslist'),
            baseRecord  = tree.store.get('class-base'),
            compRecord  = tree.store.get('class-component'),
            btnRecord   = tree.store.get('class-button');

        expect(baseRecord.checked).toBe(false);
        expect(compRecord.checked).toBe(false);
        expect(btnRecord.checked).toBe(true);

        expect(tree.getVdomChild(tree.getItemId('class-base')).cls).toContain('unchecked');
        expect(tree.getVdomChild(tree.getItemId('class-component')).cls).toContain('unchecked');
        expect(tree.getVdomChild(tree.getItemId('class-button')).cls).not.toContain('unchecked');

        expect(membersList.store.items.map(item => item.neoClassName)).toEqual(['Neo.button.Base']);

        tree.onLeafItemClick(compRecord);

        expect(compRecord.checked).toBe(true);
        expect(tree.getVdomChild(tree.getItemId('class-component')).cls).not.toContain('unchecked');
        expect(membersList.store.items.map(item => item.neoClassName)).toEqual(['Neo.component.Base', 'Neo.button.Base']);

        rootContainer.destroy();
        mainStore.destroy();
    });
});
