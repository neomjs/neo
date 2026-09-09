import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockPreviewContractTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import PreviewContract from '../../../../src/dashboard/dock/model/PreviewContract.mjs';
import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';

/**
 * @summary Builds one preview DTO without importing its implementation as fixture data.
 * @param {Object} [overrides={}]
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
test.describe('Neo.dashboard.dock.model.PreviewContract', () => {
    test('one Neo overwrite controls the rendered region and applied split, including explicit ratios', () => {
        const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
            await import('./src/Neo.mjs');
            await import('./src/core/_export.mjs');
            const {setup} = await import('./test/playwright/setup.mjs');
            setup({appConfig: {name: 'DockPreviewOverwriteTest'}});

            Neo.overwrites = {};
            Neo.ns('Neo.dashboard.dock.model.PreviewContract', true, Neo.overwrites).ratioToSizes = function(ratio, position) {
                const r = typeof ratio === 'number' && ratio > 0 && ratio < 1 ? ratio : 0.25;
                return position === 'after' ? [1 - r, r] : [r, 1 - r];
            };

            const {default: contract} = await import('./src/dashboard/dock/model/PreviewContract.mjs');
            const {default: Preview} = await import('./src/dashboard/dock/interaction/Preview.mjs');
            const {default: Operations} = await import('./src/dashboard/dock/model/Operations.mjs');
            const document = {
                schema: 'neo.dock.zone.v1', root: 'root',
                items: {
                    strategy: {reference: 'strategy', title: 'Strategy', kind: 'panel'},
                    inspector: {reference: 'inspector', title: 'Inspector', kind: 'panel'}
                },
                nodes: {
                    root: {type: 'edge-zone', zones: {center: {nodeId: 'main-tabs'}}},
                    'main-tabs': {type: 'tabs', items: ['strategy'], activeItemId: 'strategy'}
                }
            };
            const original = JSON.stringify(document);
            const rows = [];
            for (const kind of ['split-before', 'split-after', 'edge-left', 'edge-right']) {
                for (const ratio of [undefined, 0.3]) {
                    const preview = {
                        schema: 'neo.dock.preview.v1', itemId: 'inspector',
                        target: {nodeId: 'main-tabs'}, feedback: {state: 'accepted'},
                        placement: {kind, orientation: 'horizontal', ratio}
                    };
                    const before = JSON.stringify(preview);
                    const operation = contract.previewToOperation(preview);
                    const applied = Operations.applyOperation(document, operation);
                    const split = Object.values(applied.document.nodes).find(node => node.type === 'split');
                    const newIndex = split?.children.findIndex(id => applied.document.nodes[id].items?.includes('inspector'));
                    const affordance = Preview.mapPreviewToAffordance(preview);
                    const geometry = Preview.affordanceGeometry(affordance, {x: 0, y: 0, width: 400, height: 200});
                    const group = contract.previewToOperation({...preview, groupNodeId: 'other-stack'});
                    rows.push({
                        errors: applied.errors, fraction: geometry.width / 400,
                        applied: split?.sizes[newIndex], operation: operation.sizes[newIndex],
                        group: group.target.placement.sizes[newIndex],
                        unchanged: before === JSON.stringify(preview), expected: ratio ?? 0.25
                    });
                }
            }
            process.stdout.write(JSON.stringify({
                registered: contract === Neo.dashboard.dock.model.PreviewContract,
                unchanged: original === JSON.stringify(document), rows
            }));
        `], {cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8'}));

        expect(result.registered).toBe(true);
        expect(result.unchanged).toBe(true);
        expect(result.rows).toHaveLength(8);
        for (const row of result.rows) {
            expect(row.errors).toEqual([]);
            expect(row.unchanged).toBe(true);
            expect(row.fraction).toBe(row.expected);
            expect(row.applied).toBe(row.expected);
            expect(row.operation).toBe(row.expected);
            expect(row.group).toBe(row.expected)
        }
    });

    test.describe('isValidPreview (fail-closed)', () => {
        test('accepts a well-formed preview', () => {
            expect(PreviewContract.isValidPreview(preview())).toBe(true)
        });

        test('rejects null, undefined and non-objects', () => {
            expect(PreviewContract.isValidPreview(null)).toBe(false);
            expect(PreviewContract.isValidPreview(undefined)).toBe(false);
            expect(PreviewContract.isValidPreview('preview')).toBe(false)
        });

        test('rejects a wrong or missing schema', () => {
            expect(PreviewContract.isValidPreview(preview({schema: 'neo.dock.preview.v2'}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({schema: undefined}))).toBe(false)
        });

        test('rejects a missing itemId', () => {
            expect(PreviewContract.isValidPreview(preview({itemId: ''}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({itemId: undefined}))).toBe(false)
        });

        test('admits only a non-empty runtime whole-stack identity', () => {
            expect(PreviewContract.isValidPreview(preview({groupNodeId: 'popup-stack'}))).toBe(true);
            expect(PreviewContract.isValidPreview(preview({groupNodeId: ''}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({groupNodeId: 42}))).toBe(false)
        });

        test('rejects a missing target.nodeId', () => {
            expect(PreviewContract.isValidPreview(preview({target: {containerId: 'workspace'}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({target: {nodeId: ''}}))).toBe(false)
        });

        test('rejects an unknown placement.kind', () => {
            expect(PreviewContract.isValidPreview(preview({placement: {kind: 'corner-top-left'}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({placement: {}}))).toBe(false)
        });

        test('rejects a split placement without a valid orientation', () => {
            expect(PreviewContract.isValidPreview(preview({placement: {kind: 'split-before'}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({placement: {kind: 'split-after', orientation: 'diagonal'}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({placement: {kind: 'split-after', orientation: 'vertical'}}))).toBe(true)
        });

        test('rejects a missing or invalid feedback.state', () => {
            expect(PreviewContract.isValidPreview(preview({feedback: {}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({feedback: {state: 'maybe'}}))).toBe(false);
            expect(PreviewContract.isValidPreview(preview({feedback: undefined}))).toBe(false)
        });

        test('treats a rejected placement as structurally valid', () => {
            expect(PreviewContract.isValidPreview(preview({placement: {kind: 'rejected'}, feedback: {state: 'rejected'}}))).toBe(true)
        })
    });

    test.describe('previewToOperation (semantic drop, never mutates)', () => {
        test('tab placements route to addTab with the target tabs node and index', () => {
            const op = PreviewContract.previewToOperation(preview({placement: {kind: 'tab-after', index: 1}}));
            expect(op.operation).toBe('addTab');
            expect(op.tabsNodeId).toBe('main-tabs');
            expect(op.itemId).toBe('strategy');
            expect(op.index).toBe(1)
        });

        test('split placements route to splitNode with orientation and normalized sizes', () => {
            const op = PreviewContract.previewToOperation(preview({placement: {kind: 'split-before', orientation: 'vertical', ratio: 0.3}}));
            expect(op.operation).toBe('splitNode');
            expect(op.orientation).toBe('vertical');
            expect(op.position).toBe('before');
            expect(op.sizes).toEqual([0.3, 0.7])
        });

        test('edge placements route to splitNode with a derived orientation', () => {
            const left = PreviewContract.previewToOperation(preview({placement: {kind: 'edge-left'}}));
            expect(left.operation).toBe('splitNode');
            expect(left.edge).toBe('left');
            expect(left.orientation).toBe('horizontal');

            const bottom = PreviewContract.previewToOperation(preview({placement: {kind: 'edge-bottom'}}));
            expect(bottom.orientation).toBe('vertical')
        });

        test('whole-stack previews preserve the placement grammar in one transferNode descriptor', () => {
            const groupNodeId = 'popup-stack';

            expect(PreviewContract.previewToOperation(preview({groupNodeId, placement: {kind: 'tab-into'}}))).toEqual({
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {targetNodeId: 'main-tabs', placement: {kind: 'tab-into'}}
            });

            expect(PreviewContract.previewToOperation(preview({
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

            expect(PreviewContract.previewToOperation(preview({groupNodeId, placement: {kind: 'edge-right'}}))).toEqual({
                operation: 'transferNode',
                nodeId   : groupNodeId,
                target   : {
                    targetNodeId: 'main-tabs',
                    placement   : {edge: 'right', orientation: 'horizontal', sizes: [0.5, 0.5]}
                }
            })
        });

        test('returns null for rejected feedback', () => {
            expect(PreviewContract.previewToOperation(preview({feedback: {state: 'rejected'}}))).toBe(null)
        });

        test('returns null for a rejected placement', () => {
            expect(PreviewContract.previewToOperation(preview({placement: {kind: 'rejected'}, feedback: {state: 'rejected'}}))).toBe(null)
        });

        test('returns null for an invalid preview', () => {
            expect(PreviewContract.previewToOperation(preview({itemId: ''}))).toBe(null)
        });

        test('never leaks a runtime-only field into the operation descriptor', () => {
            const op = PreviewContract.previewToOperation(preview());
            expect(op).not.toHaveProperty('previewId');
            expect(op).not.toHaveProperty('source');
            expect(op).not.toHaveProperty('feedback');
            expect(JSON.stringify(op)).not.toContain('dashboard-sort-zone')
        })
    });

    test.describe('ratioToSizes', () => {
        test('defaults to an even split for an absent or invalid ratio', () => {
            expect(PreviewContract.ratioToSizes(undefined, 'before')).toEqual([0.5, 0.5]);
            expect(PreviewContract.ratioToSizes(0, 'before')).toEqual([0.5, 0.5]);
            expect(PreviewContract.ratioToSizes(1.5, 'after')).toEqual([0.5, 0.5])
        });

        test('honors a valid ratio for before and after positions', () => {
            expect(PreviewContract.ratioToSizes(0.25, 'before')).toEqual([0.25, 0.75]);
            expect(PreviewContract.ratioToSizes(0.25, 'after')).toEqual([0.75, 0.25])
        })
    });
});
