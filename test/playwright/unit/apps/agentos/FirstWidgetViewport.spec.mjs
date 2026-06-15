import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSFirstWidgetViewportTest'
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs';
import path           from 'path';
import {fileURLToPath} from 'url';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Viewport, {
    createFirstWidgetGridItem,
    FIRST_WIDGET_BLUEPRINT,
    FIRST_WIDGET_BLUEPRINT_SCHEMA,
    isValidFirstWidgetBlueprint
} from '../../../../../apps/agentos/childapps/widget/view/Viewport.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    scssPath   = path.join(repoRoot, 'resources/scss/src/apps/agentos/Viewport.scss'),
    viewportPath = path.join(repoRoot, 'apps/agentos/childapps/widget/view/Viewport.mjs');

test.describe('AgentOSWidget.view.Viewport first-widget blueprint', () => {
    test('accepts the constrained static first-widget blueprint', () => {
        expect(FIRST_WIDGET_BLUEPRINT.schema).toBe(FIRST_WIDGET_BLUEPRINT_SCHEMA);
        expect(isValidFirstWidgetBlueprint(FIRST_WIDGET_BLUEPRINT)).toBe(true)
    });

    test('rejects unknown executable or schema fields', () => {
        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            render: 'alert(1)'
        })).toBe(false);

        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            schema: 'neo.harness.firstWidget.v2'
        })).toBe(false);

        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            columns: [{...FIRST_WIDGET_BLUEPRINT.columns[0], renderer: 'danger'}]
        })).toBe(false);

        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            summary: {html: '<script></script>'}
        })).toBe(false);

        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            liveState: {...FIRST_WIDGET_BLUEPRINT.liveState, status: 1}
        })).toBe(false);

        expect(isValidFirstWidgetBlueprint({
            ...FIRST_WIDGET_BLUEPRINT,
            rows: [{...FIRST_WIDGET_BLUEPRINT.rows[0], nextStep: {html: '<script></script>'}}]
        })).toBe(false)
    });

    test('creates a live grid component config from the blueprint', () => {
        const gridItem = createFirstWidgetGridItem(FIRST_WIDGET_BLUEPRINT);

        expect(gridItem.module?.prototype?.className).toBe('Neo.grid.Container');
        expect(gridItem.reference).toBe('first-widget-grid');
        expect(gridItem.store.data).toHaveLength(FIRST_WIDGET_BLUEPRINT.rows.length);
        expect(gridItem.columns.map(column => column.dataField)).toEqual(
            FIRST_WIDGET_BLUEPRINT.columns.map(column => column.dataField)
        );
        expect(JSON.stringify(gridItem)).not.toContain('alert')
    });

    test('fails closed to a bounded component for invalid blueprints', () => {
        const item = createFirstWidgetGridItem({schema: 'invalid'});

        expect(item.ntype).toBe('component');
        expect(item.cls).toContain('agent-first-widget-empty');
        expect(item.html).toContain('rejected')
    });

    test('viewport publishes the first-widget pane inside the child app shell', () => {
        const source = fs.readFileSync(viewportPath, 'utf8');

        expect(source).toContain("cls: ['agent-os-viewport', 'agent-first-widget-viewport']");
        expect(source).toContain("cls    : ['agent-first-widget-panel']");
        expect(source).toContain("reference: 'first-widget-grid'");
        expect(source).toContain("layout: {ntype: 'vbox', align: 'stretch'}");
        expect(source).toContain("flex : 'none'");
        expect(source).toContain('height: 48')
    });

    test('stylesheet consumes the AgentOS grid surface tokens', () => {
        const scss = fs.readFileSync(scssPath, 'utf8');

        expect(scss).toContain('.agent-first-widget-panel');
        expect(scss).toContain('var(--agent-surface-grid)');
        expect(scss).toContain('var(--agent-accent-grid)');
        expect(scss).toContain('var(--agent-state-live)')
    })
});
