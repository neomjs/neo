import {setup} from '../../../../setup.mjs';

const appName = 'KBQueryServiceClassHierarchyTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs-extra';
import path           from 'path';

test.describe('Neo.ai.services.knowledge-base.QueryService#getClassHierarchy', () => {
    let aiConfig;
    let QueryService;
    let originalHierarchyPath;
    let tmpHierarchyPath;

    test.beforeAll(async () => {
        aiConfig      = (await import('../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
        QueryService  = (await import('../../../../../../ai/services/knowledge-base/QueryService.mjs')).default;

        originalHierarchyPath = aiConfig.hierarchyPath;
        tmpHierarchyPath      = path.resolve(process.cwd(), 'tmp', `kb-hierarchy-${process.pid}-${Date.now()}.json`);
        await fs.ensureDir(path.dirname(tmpHierarchyPath));
    });

    test.afterEach(async () => {
        aiConfig.hierarchyPath = originalHierarchyPath;
        await fs.remove(tmpHierarchyPath).catch(() => {});
    });

    test('requires a root to protect callers from excessive hierarchy payloads', async () => {
        await expect(QueryService.getClassHierarchy())
            .rejects.toThrow('The "root" parameter is required to prevent excessive context payload.');
    });

    test('throws a sync guidance error when the hierarchy file is absent', async () => {
        aiConfig.hierarchyPath = tmpHierarchyPath;

        await expect(QueryService.getClassHierarchy({root: 'Neo.component.Base'}))
            .rejects.toThrow('Class hierarchy file not found. Please sync the knowledge base first.');
    });

    test('returns the requested root and all recursive descendants', async () => {
        aiConfig.hierarchyPath = tmpHierarchyPath;
        await fs.writeJson(tmpHierarchyPath, {
            'Neo.component.Base'  : 'Neo.core.Base',
            'Neo.button.Base'     : 'Neo.component.Base',
            'Neo.form.field.Text' : 'Neo.component.Base',
            'Neo.form.field.Email': 'Neo.form.field.Text',
            'Neo.grid.Base'       : 'Neo.component.Base',
            'Neo.data.Store'      : 'Neo.core.Base'
        });

        await expect(QueryService.getClassHierarchy({root: 'Neo.component.Base'}))
            .resolves.toEqual({
                'Neo.component.Base'  : 'Neo.core.Base',
                'Neo.button.Base'     : 'Neo.component.Base',
                'Neo.form.field.Text' : 'Neo.component.Base',
                'Neo.grid.Base'       : 'Neo.component.Base',
                'Neo.form.field.Email': 'Neo.form.field.Text'
            });
    });

    test('reports a known leaf root with no subclasses without expanding payload', async () => {
        aiConfig.hierarchyPath = tmpHierarchyPath;
        await fs.writeJson(tmpHierarchyPath, {
            'Neo.core.Base': null
        });

        await expect(QueryService.getClassHierarchy({root: 'Neo.core.Base'}))
            .resolves.toEqual({
                'Neo.core.Base': null
            });
    });

    test('reports an unknown root without leaking the whole hierarchy', async () => {
        aiConfig.hierarchyPath = tmpHierarchyPath;
        await fs.writeJson(tmpHierarchyPath, {
            'Neo.component.Base': 'Neo.core.Base'
        });

        await expect(QueryService.getClassHierarchy({root: 'Neo.unknown.Missing'}))
            .resolves.toEqual({
                message: "Class 'Neo.unknown.Missing' found in hierarchy, but it has no subclasses or entry."
            });
    });
});
