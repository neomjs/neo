import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'AgentOSDockPreviewTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DockPreview    from '../../../../../apps/agentos/view/DockPreview.mjs';
import fs             from 'fs';
import path           from 'path';
import {fileURLToPath} from 'url';

/**
 * @summary Tests for AgentOS.view.DockPreview — the drag-time dock preview renderer.
 * Covers the pure contract logic (validity / affordance mapping / semantic-drop conversion /
 * geometry) plus the component lifecycle (render, fail-closed cleanup, drag-source binding).
 */

/**
 * Builds a well-formed `neo.harness.dockPreview.v1` object, with optional field overrides.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function preview(overrides = {}) {
    return {
        schema   : 'neo.harness.dockPreview.v1',
        previewId: 'preview:strategy:main-tabs:tab-after:1',
        itemId   : 'strategy',
        source   : {surface: 'dashboard-sort-zone', sortZoneId: 'left-workspace'},
        target   : {containerId: 'workspace', nodeId: 'main-tabs'},
        placement: {kind: 'tab-after', index: 1},
        feedback : {state: 'accepted'},
        ...overrides
    }
}

const
    __filename = fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    repoRoot   = path.resolve(__dirname, '../../../../..');

test.describe('AgentOS.view.DockPreview', () => {
    test.describe('stylesheet contract (visible affordances)', () => {
        test('the structural scss backs the emitted affordance classes with visible styling', () => {
            const scss = fs.readFileSync(path.join(repoRoot, 'resources/scss/src/apps/agentos/DockPreview.scss'), 'utf8');

            expect(scss).toContain('.neo-dock-preview-affordance');
            expect(scss).toContain('.neo-dock-preview-accepted');
            expect(scss).toContain('.neo-dock-preview-rejected');
            // accepted/rejected states carry real visual treatment, not just class names
            expect(scss).toContain('background-color');
            expect(scss).toContain('border');
            expect(scss).toContain('opacity')
        });

        test('both harness themes define the accept/reject affordance tokens', () => {
            const dark  = fs.readFileSync(path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/agentos/DockPreview.scss'), 'utf8');
            const light = fs.readFileSync(path.join(repoRoot, 'resources/scss/theme-neo-light/apps/agentos/DockPreview.scss'), 'utf8');

            expect(dark).toContain('neo-theme-neo-dark');
            expect(dark).toContain('--agent-dock-preview-accept');
            expect(dark).toContain('--agent-dock-preview-reject');

            expect(light).toContain('neo-theme-neo-light');
            expect(light).toContain('--agent-dock-preview-accept');
            expect(light).toContain('--agent-dock-preview-reject')
        })
    });

    test.describe('isValidPreview (fail-closed)', () => {
        test('accepts a well-formed preview', () => {
            expect(DockPreview.isValidPreview(preview())).toBe(true)
        });

        test('rejects null, undefined and non-objects', () => {
            expect(DockPreview.isValidPreview(null)).toBe(false);
            expect(DockPreview.isValidPreview(undefined)).toBe(false);
            expect(DockPreview.isValidPreview('preview')).toBe(false)
        });

        test('rejects a wrong or missing schema', () => {
            expect(DockPreview.isValidPreview(preview({schema: 'neo.harness.dockPreview.v2'}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({schema: undefined}))).toBe(false)
        });

        test('rejects a missing itemId', () => {
            expect(DockPreview.isValidPreview(preview({itemId: ''}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({itemId: undefined}))).toBe(false)
        });

        test('rejects a missing target.nodeId', () => {
            expect(DockPreview.isValidPreview(preview({target: {containerId: 'workspace'}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({target: {nodeId: ''}}))).toBe(false)
        });

        test('rejects an unknown placement.kind', () => {
            expect(DockPreview.isValidPreview(preview({placement: {kind: 'corner-top-left'}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({placement: {}}))).toBe(false)
        });

        test('rejects a split placement without a valid orientation', () => {
            expect(DockPreview.isValidPreview(preview({placement: {kind: 'split-before'}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({placement: {kind: 'split-after', orientation: 'diagonal'}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({placement: {kind: 'split-after', orientation: 'vertical'}}))).toBe(true)
        });

        test('rejects a missing or invalid feedback.state', () => {
            expect(DockPreview.isValidPreview(preview({feedback: {}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({feedback: {state: 'maybe'}}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({feedback: undefined}))).toBe(false)
        });

        test('treats a rejected placement as structurally valid', () => {
            expect(DockPreview.isValidPreview(preview({placement: {kind: 'rejected'}, feedback: {state: 'rejected'}}))).toBe(true)
        })
    });

    test.describe('mapPreviewToAffordance', () => {
        test('maps every edge kind to an edge affordance', () => {
            for (const edge of ['top', 'right', 'bottom', 'left']) {
                const affordance = DockPreview.mapPreviewToAffordance(preview({placement: {kind: `edge-${edge}`}}));
                expect(affordance.group).toBe('edge');
                expect(affordance.edge).toBe(edge);
                expect(affordance.kind).toBe(`edge-${edge}`);
                expect(affordance.targetNodeId).toBe('main-tabs')
            }
        });

        test('maps split kinds with orientation and position', () => {
            const affordance = DockPreview.mapPreviewToAffordance(preview({placement: {kind: 'split-after', orientation: 'horizontal'}}));
            expect(affordance.group).toBe('split');
            expect(affordance.position).toBe('after');
            expect(affordance.orientation).toBe('horizontal')
        });

        test('maps tab kinds with position and index', () => {
            const affordance = DockPreview.mapPreviewToAffordance(preview({placement: {kind: 'tab-before', index: 2}}));
            expect(affordance.group).toBe('tab');
            expect(affordance.position).toBe('before');
            expect(affordance.index).toBe(2)
        });

        test('defaults a non-integer tab index to null', () => {
            const affordance = DockPreview.mapPreviewToAffordance(preview({placement: {kind: 'tab-into'}}));
            expect(affordance.index).toBe(null)
        });

        test('still renders a rejected-feedback candidate but flags it not accepted', () => {
            const affordance = DockPreview.mapPreviewToAffordance(preview({feedback: {state: 'rejected'}}));
            expect(affordance).not.toBe(null);
            expect(affordance.group).toBe('tab');
            expect(affordance.accepted).toBe(false)
        });

        test('returns null for a rejected placement (no candidate to draw)', () => {
            expect(DockPreview.mapPreviewToAffordance(preview({placement: {kind: 'rejected'}, feedback: {state: 'rejected'}}))).toBe(null)
        });

        test('returns null for an invalid preview', () => {
            expect(DockPreview.mapPreviewToAffordance(preview({schema: 'nope'}))).toBe(null);
            expect(DockPreview.mapPreviewToAffordance(null)).toBe(null)
        })
    });

    test.describe('previewToOperation (semantic drop, never mutates)', () => {
        test('tab placements route to addTab with the target tabs node and index', () => {
            const op = DockPreview.previewToOperation(preview({placement: {kind: 'tab-after', index: 1}}));
            expect(op.operation).toBe('addTab');
            expect(op.tabsNodeId).toBe('main-tabs');
            expect(op.itemId).toBe('strategy');
            expect(op.index).toBe(1)
        });

        test('split placements route to splitNode with orientation and normalized sizes', () => {
            const op = DockPreview.previewToOperation(preview({placement: {kind: 'split-before', orientation: 'vertical', ratio: 0.3}}));
            expect(op.operation).toBe('splitNode');
            expect(op.orientation).toBe('vertical');
            expect(op.position).toBe('before');
            expect(op.sizes).toEqual([0.3, 0.7])
        });

        test('edge placements route to splitNode with a derived orientation', () => {
            const left = DockPreview.previewToOperation(preview({placement: {kind: 'edge-left'}}));
            expect(left.operation).toBe('splitNode');
            expect(left.edge).toBe('left');
            expect(left.orientation).toBe('horizontal');

            const bottom = DockPreview.previewToOperation(preview({placement: {kind: 'edge-bottom'}}));
            expect(bottom.orientation).toBe('vertical')
        });

        test('returns null for rejected feedback', () => {
            expect(DockPreview.previewToOperation(preview({feedback: {state: 'rejected'}}))).toBe(null)
        });

        test('returns null for a rejected placement', () => {
            expect(DockPreview.previewToOperation(preview({placement: {kind: 'rejected'}, feedback: {state: 'rejected'}}))).toBe(null)
        });

        test('returns null for an invalid preview', () => {
            expect(DockPreview.previewToOperation(preview({itemId: ''}))).toBe(null)
        });

        test('never leaks a runtime-only field into the operation descriptor', () => {
            const op = DockPreview.previewToOperation(preview());
            expect(op).not.toHaveProperty('previewId');
            expect(op).not.toHaveProperty('source');
            expect(op).not.toHaveProperty('feedback');
            expect(JSON.stringify(op)).not.toContain('dashboard-sort-zone')
        })
    });

    test.describe('ratioToSizes', () => {
        test('defaults to an even split for an absent or invalid ratio', () => {
            expect(DockPreview.ratioToSizes(undefined, 'before')).toEqual([0.5, 0.5]);
            expect(DockPreview.ratioToSizes(0, 'before')).toEqual([0.5, 0.5]);
            expect(DockPreview.ratioToSizes(1.5, 'after')).toEqual([0.5, 0.5])
        });

        test('honors a valid ratio for before and after positions', () => {
            expect(DockPreview.ratioToSizes(0.25, 'before')).toEqual([0.25, 0.75]);
            expect(DockPreview.ratioToSizes(0.25, 'after')).toEqual([0.75, 0.25])
        })
    });

    test.describe('affordanceGeometry (pure, never throws)', () => {
        const rect = {x: 10, y: 20, width: 200, height: 100};

        test('returns null for an absent or non-numeric rect', () => {
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'}, null)).toBe(null);
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'}, {x: 'a', y: 0, width: 1, height: 1})).toBe(null);
            expect(DockPreview.affordanceGeometry(null, rect)).toBe(null)
        });

        test('an edge-top affordance is a band across the top', () => {
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'}, rect)).toEqual({x: 10, y: 20, width: 200, height: 24})
        });

        test('an edge-right affordance is a band down the right side', () => {
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'right'}, rect)).toEqual({x: 186, y: 20, width: 24, height: 100})
        });

        test('a tab-into affordance highlights the whole node', () => {
            expect(DockPreview.affordanceGeometry({group: 'tab', position: 'into'}, rect)).toEqual(rect)
        });

        test('a horizontal split-after affordance is a guide line on the right edge', () => {
            const geo = DockPreview.affordanceGeometry({group: 'split', orientation: 'horizontal', position: 'after'}, rect);
            expect(geo).toEqual({x: 204, y: 20, width: 6, height: 100})
        })
    });

    test.describe('component lifecycle', () => {
        let instance;

        test.afterEach(() => {
            instance?.destroy();
            instance = null
        });

        test('renders an affordance node for a valid preview and clears on null', () => {
            instance = Neo.create(DockPreview, {id: 'dock-preview-render-test'});

            instance.dockPreview = preview();
            expect(instance.vdom.cn.length).toBe(1);
            expect(instance.vdom.cn[0].cls).toContain('neo-dock-preview-tab');
            expect(instance.vdom.cn[0].cls).toContain('neo-dock-preview-accepted');
            expect(instance.vdom.cn[0]['data-dock-target']).toBe('main-tabs');

            instance.clearPreview();
            expect(instance.dockPreview).toBe(null);
            expect(instance.vdom.cn.length).toBe(0)
        });

        test('an invalid preview fails closed to an empty overlay', () => {
            instance = Neo.create(DockPreview, {id: 'dock-preview-failclosed-test'});

            instance.dockPreview = {schema: 'wrong'};
            expect(instance.vdom.cn.length).toBe(0)
        });

        test('bindDragSource clears the overlay on a drag-lifecycle terminal', () => {
            const handlers   = {};
            const mockSource = {
                on(name, fn, scope) { handlers[name] = {fn, scope} },
                un(name, fn, scope) { if (handlers[name]?.fn === fn) delete handlers[name] },
                fire(name)          { handlers[name]?.fn.call(handlers[name].scope) }
            };

            instance = Neo.create(DockPreview, {id: 'dock-preview-bind-test'});
            instance.bindDragSource(mockSource);

            instance.dockPreview = preview();
            expect(instance.vdom.cn.length).toBe(1);

            mockSource.fire('dragEnd');
            expect(instance.dockPreview).toBe(null);
            expect(instance.vdom.cn.length).toBe(0);

            mockSource.fire('dragBoundaryExit');
            expect(instance.dockPreview).toBe(null)
        });

        test('applyTargetGeometry positions the active affordance from a runtime rect', () => {
            instance = Neo.create(DockPreview, {id: 'dock-preview-geometry-test'});

            instance.dockPreview = preview({placement: {kind: 'edge-top'}, feedback: {state: 'accepted'}});
            instance.applyTargetGeometry({x: 10, y: 20, width: 200, height: 100});

            const {style} = instance.vdom.cn[0];
            expect(style.position).toBe('absolute');
            expect(style.left).toBe('10px');
            expect(style.top).toBe('20px');
            expect(style.width).toBe('200px');
            expect(style.height).toBe('24px')
        })
    })
});
