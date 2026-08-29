import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockPreviewTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import DockPreview     from '../../../../src/dashboard/dock/interaction/Preview.mjs';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * @summary Tests for Neo.dashboard.dock.interaction.Preview — the drag-time dock preview renderer.
 * Covers the pure contract logic (validity / affordance mapping / semantic-drop conversion /
 * geometry) plus the component lifecycle (render, fail-closed cleanup, drag-source binding).
 */

/**
 * Builds a well-formed `neo.dock.preview.v1` object, with optional field overrides.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function preview(overrides = {}) {
    return {
        schema   : 'neo.dock.preview.v1',
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
    repoRoot   = path.resolve(__dirname, '../../../..');

test.describe('Neo.dashboard.dock.interaction.Preview', () => {
    test.describe('stylesheet contract (visible affordances)', () => {
        test('the structural scss backs the emitted affordance classes with visible styling', () => {
            const scss = fs.readFileSync(path.join(repoRoot, 'resources/scss/src/dashboard/dock/interaction/Preview.scss'), 'utf8');

            expect(scss).toContain('.neo-dock-preview-affordance');
            expect(scss).toContain('.neo-dock-preview-accepted');
            expect(scss).toContain('.neo-dock-preview-rejected');
            // the result-region mode class routes directional placements into the filled
            // family, and each cut-side accent the renderer can emit is backed
            expect(scss).toContain('.neo-dock-preview-region');
            expect(scss).toContain('.neo-dock-preview-cut-top');
            expect(scss).toContain('.neo-dock-preview-cut-right');
            expect(scss).toContain('.neo-dock-preview-cut-bottom');
            expect(scss).toContain('.neo-dock-preview-cut-left');
            // accepted/rejected states carry real visual treatment, not just class names
            expect(scss).toContain('background-color');
            expect(scss).toContain('border');
            expect(scss).toContain('opacity')
        });

        test('shared consumers stay on the declared DockPreview contract', () => {
            const structural = fs.readFileSync(path.join(repoRoot, 'resources/scss/src/dashboard/dock/interaction/Preview.scss'), 'utf8'),
                  consumers  = [...new Set(
                      [...structural.matchAll(/var\((--(?:fm|dock-transition)-[\w-]+)/g)].map(match => match[1])
                  )].sort();

            // The structural (shared-tier) file is where CONSUMPTION happens — it may read the
            // dock motion aliases and NOTHING app-flavored. This census fails if a call site
            // invents a pseudo-token or reaches for an --fm-* app palette directly (the shared
            // tier must stay app-neutral; apps project palettes through the domain aliases).
            expect(consumers).toEqual([
                '--dock-transition-duration',
                '--dock-transition-easing'
            ])
        })

        test('the proxy surface and signal language have no fallbacks and stay dock-owned', () => {
            const
                containerScss = fs.readFileSync(path.join(repoRoot, 'resources/scss/src/dashboard/Container.scss'), 'utf8'),
                previewScss   = fs.readFileSync(path.join(repoRoot, 'resources/scss/src/dashboard/dock/interaction/Preview.scss'), 'utf8'),
                // strip line comments: the census asserts on SELECTORS and declarations, not prose
                uncomment     = source => source.replace(/\/\/[^\n]*/g, ''),
                signalStart   = containerScss.indexOf('.neo-preview-lang-signal');

            expect(signalStart).toBeGreaterThan(-1);

            // No-masking census: a signal alias consumed WITH a literal fallback re-creates the
            // fallback-masking class this variant's whole review cycle exists to kill — an
            // equal-valued literal hides a missing app projection in exactly one mode. Every
            // shared signal consumer (the indicator/chip section + the proxy edge-light in
            // Container.scss) consumes the aliases bare.
            [containerScss.slice(signalStart), previewScss].forEach(source => {
                expect([...source.matchAll(/var\(--agent-dock-preview-signal[\w-]*\s*,/g)]).toEqual([])
            });
            expect([...containerScss.matchAll(/var\(--agent-dock-proxy[\w-]*\s*,/g)]).toEqual([]);

            // Ownership census: the proxy treatment scopes to the dock-owned embodiment marker
            // (stamped by DockTabSortZone#getDragProxyConfig), NEVER to the generic
            // `.neo-dragproxy` every drag system shares, and never through a page-global
            // `:root:has()` gate — that shape escapes both the docking owner (styling grid /
            // list / tree proxies) and the theme subtree (body-level fallback resolution).
            const selectors = uncomment(containerScss);

            expect(selectors).toContain('body > .neo-dock-dragproxy.neo-tab-header-toolbar {');
            expect(selectors).toContain('--tab-button-glyph-color: var(--agent-dock-proxy-text)');
            expect(selectors).toContain('--tab-button-text-color : var(--agent-dock-proxy-text)');
            expect(selectors).toContain('.neo-dock-dragproxy.neo-preview-lang-signal');
            expect(selectors).toContain('background   : var(--agent-dock-proxy-ground)');
            expect(selectors).toContain('border       : 1px solid var(--agent-dock-proxy-border)');
            expect(selectors).toContain('color        : var(--agent-dock-proxy-text)');
            expect(selectors).not.toContain(':root:has(');
            expect([...selectors.matchAll(/(?<![\w-])\.neo-dragproxy(?![\w-])/g)]).toEqual([])
        })

        test('the workstation projects every dock-affordance domain alias in both modes', () => {
            const
                dark  = fs.readFileSync(path.join(repoRoot, 'resources/scss/theme-neo-dark/apps/workstation/Viewport.scss'), 'utf8'),
                light = fs.readFileSync(path.join(repoRoot, 'resources/scss/theme-neo-light/apps/workstation/Viewport.scss'), 'utf8');

            // The flagship consumes the shared preview family (default AND signal), so BOTH mode
            // files must project the full preview + proxy contract. With the no-fallback census above,
            // a deleted or forgotten projection row now fails HERE instead of silently rendering
            // another app's chroma — the exact miss the cycle-2 review falsified on the proxy.
            [
                '--agent-dock-preview-accept',
                '--agent-dock-preview-accept-fill',
                '--agent-dock-preview-reject',
                '--agent-dock-preview-reject-fill',
                '--agent-dock-preview-signal',
                '--agent-dock-preview-signal-fill',
                '--agent-dock-preview-signal-ground',
                '--agent-dock-proxy-border',
                '--agent-dock-proxy-ground',
                '--agent-dock-proxy-shadow',
                '--agent-dock-proxy-text'
            ].forEach(alias => {
                const declaration = new RegExp(`${alias}\\s*:`);

                expect(dark, `${alias} projected in dark`).toMatch(declaration);
                expect(light, `${alias} projected in light`).toMatch(declaration)
            })
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
            expect(DockPreview.isValidPreview(preview({schema: 'neo.dock.preview.v2'}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({schema: undefined}))).toBe(false)
        });

        test('rejects a missing itemId', () => {
            expect(DockPreview.isValidPreview(preview({itemId: ''}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({itemId: undefined}))).toBe(false)
        });

        test('admits only a non-empty runtime whole-stack identity', () => {
            expect(DockPreview.isValidPreview(preview({groupNodeId: 'popup-stack'}))).toBe(true);
            expect(DockPreview.isValidPreview(preview({groupNodeId: ''}))).toBe(false);
            expect(DockPreview.isValidPreview(preview({groupNodeId: 42}))).toBe(false)
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

        test('whole-stack previews preserve the placement grammar in one transferNode descriptor', () => {
            const groupNodeId = 'popup-stack';

            expect(DockPreview.previewToOperation(preview({groupNodeId, placement: {kind: 'tab-into'}}))).toEqual({
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {targetNodeId: 'main-tabs', placement: {kind: 'tab-into'}}
            });

            expect(DockPreview.previewToOperation(preview({
                groupNodeId,
                placement: {kind: 'split-before', orientation: 'vertical', ratio: 0.3}
            }))).toEqual({
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {
                    targetNodeId: 'main-tabs',
                    placement   : {orientation: 'vertical', position: 'before', sizes: [0.3, 0.7]}
                }
            });

            expect(DockPreview.previewToOperation(preview({groupNodeId, placement: {kind: 'edge-right'}}))).toEqual({
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {
                    targetNodeId: 'main-tabs',
                    placement   : {edge: 'right', orientation: 'horizontal', sizes: [0.5, 0.5]}
                }
            })
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

        test('DEFAULT (result regions): an edge affordance is the half the new pane would occupy', () => {
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'},   rect)).toEqual({x: 10,  y: 20, width: 200, height: 50});
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'right'}, rect)).toEqual({x: 110, y: 20, width: 100, height: 100});
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'bottom'},rect)).toEqual({x: 10,  y: 70, width: 200, height: 50});
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'left'},  rect)).toEqual({x: 10,  y: 20, width: 100, height: 100})
        });

        test('DEFAULT (result regions): a split affordance is the new sibling\'s half along the axis', () => {
            expect(DockPreview.affordanceGeometry({group: 'split', orientation: 'horizontal', position: 'before'}, rect))
                .toEqual({x: 10, y: 20, width: 100, height: 100});
            expect(DockPreview.affordanceGeometry({group: 'split', orientation: 'horizontal', position: 'after'}, rect))
                .toEqual({x: 110, y: 20, width: 100, height: 100});
            expect(DockPreview.affordanceGeometry({group: 'split', orientation: 'vertical', position: 'before'}, rect))
                .toEqual({x: 10, y: 20, width: 200, height: 50});
            expect(DockPreview.affordanceGeometry({group: 'split', orientation: 'vertical', position: 'after'}, rect))
                .toEqual({x: 10, y: 70, width: 200, height: 50})
        });

        test('a tab-into affordance highlights the whole node in both modes', () => {
            expect(DockPreview.affordanceGeometry({group: 'tab', position: 'into'}, rect)).toEqual(rect);
            expect(DockPreview.affordanceGeometry({group: 'tab', position: 'into'}, rect, {resultRegionPreviews: false})).toEqual(rect)
        });

        test('resultRegionPreviews: false restores the classic band and guide-line presentation', () => {
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'}, rect, {resultRegionPreviews: false}))
                .toEqual({x: 10, y: 20, width: 200, height: 24});
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'right'}, rect, {resultRegionPreviews: false}))
                .toEqual({x: 186, y: 20, width: 24, height: 100});
            expect(DockPreview.affordanceGeometry({group: 'split', orientation: 'horizontal', position: 'after'}, rect, {resultRegionPreviews: false}))
                .toEqual({x: 204, y: 20, width: 6, height: 100})
        });

        test('sizing policy rides the options in line mode: explicit band/line values honored + clamped', () => {
            // a touch-density consumer widens the band
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'top'}, rect, {edgeBandSize: 48, resultRegionPreviews: false}))
                .toEqual({x: 10, y: 20, width: 200, height: 48});
            // clamping survives the override: the band never exceeds the target rect
            // (edge-left renders the band as WIDTH: min(500, 200, 100) = 100)
            expect(DockPreview.affordanceGeometry({group: 'edge', edge: 'left'}, rect, {edgeBandSize: 500, resultRegionPreviews: false}))
                .toEqual({x: 10, y: 20, width: 100, height: 100});
            // guide thickness follows the same policy surface
            const geo = DockPreview.affordanceGeometry({group: 'split', orientation: 'horizontal', position: 'after'}, rect, {resultRegionPreviews: false, splitLineSize: 10});
            expect(geo).toEqual({x: 200, y: 20, width: 10, height: 100})
        })
    });

    test.describe('cutSide (the region\'s inner edge — where the future splitter sits)', () => {
        test('edge regions cut on the side facing the remaining half', () => {
            expect(DockPreview.cutSide({group: 'edge', edge: 'top'})).toBe('bottom');
            expect(DockPreview.cutSide({group: 'edge', edge: 'bottom'})).toBe('top');
            expect(DockPreview.cutSide({group: 'edge', edge: 'left'})).toBe('right');
            expect(DockPreview.cutSide({group: 'edge', edge: 'right'})).toBe('left')
        });

        test('split regions cut on the boundary toward the existing sibling', () => {
            expect(DockPreview.cutSide({group: 'split', orientation: 'horizontal', position: 'before'})).toBe('right');
            expect(DockPreview.cutSide({group: 'split', orientation: 'horizontal', position: 'after'})).toBe('left');
            expect(DockPreview.cutSide({group: 'split', orientation: 'vertical', position: 'before'})).toBe('bottom');
            expect(DockPreview.cutSide({group: 'split', orientation: 'vertical', position: 'after'})).toBe('top')
        });

        test('non-directional affordances carry no cut', () => {
            expect(DockPreview.cutSide({group: 'tab', position: 'into'})).toBe(null);
            expect(DockPreview.cutSide(null)).toBe(null)
        })
    });

    test.describe('sizing policy (instance configuration)', () => {
        test('an instance override flows into the positioned affordance geometry', () => {
            const instance = Neo.create(DockPreview, {
                edgeBandSize        : 48,
                id                  : 'dock-preview-sizing-test',
                resultRegionPreviews: false
            });

            instance.dockPreview = preview({placement: {kind: 'edge-top'}});

            instance.applyTargetGeometry({x: 0, y: 0, width: 300, height: 200});

            // the consumer's hardware/UI sizing is honored on the live overlay node
            expect(instance.vdom.cn[0].style.height).toBe('48px');

            instance.destroy()
        });

        test('the region default paints the result half and marks its cut edge', () => {
            const instance = Neo.create(DockPreview, {id: 'dock-preview-region-test'});

            instance.dockPreview = preview({placement: {kind: 'edge-top'}});

            instance.applyTargetGeometry({x: 0, y: 0, width: 300, height: 200});

            const node = instance.vdom.cn[0];

            // the outcome region: the top HALF of the target, not a 24px strip
            expect(node.style.height).toBe('100px');
            expect(node.style.width).toBe('300px');
            expect(node.cls).toContain('neo-dock-preview-region');
            expect(node.cls).toContain('neo-dock-preview-cut-bottom');

            // flipping the config back re-renders the classic band on the next preview
            instance.resultRegionPreviews = false;
            instance.dockPreview = preview({placement: {kind: 'edge-top'}, previewId: 'preview:alpha:main-tabs:edge-top:2'});
            instance.applyTargetGeometry({x: 0, y: 0, width: 300, height: 200});

            const lineNode = instance.vdom.cn[0];
            expect(lineNode.style.height).toBe('24px');
            expect(lineNode.cls).not.toContain('neo-dock-preview-region');

            instance.destroy()
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
            // the region default paints the outcome half (100 / 2), not the 24px strip
            expect(style.height).toBe('50px')
        })
    })
});
