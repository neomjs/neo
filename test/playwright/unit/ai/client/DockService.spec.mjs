import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DockService    from '../../../../../src/ai/client/DockService.mjs';
import DockZoneModel  from '../../../../../src/dashboard/DockZoneModel.mjs';

/**
 * @summary Tests for the worker-side Neural Link dock tools: fail-closed operation vocabulary,
 * holder resolution, and the landed dual commit path (override-preferred, reducer-fallback).
 */
test.describe.serial('Neo.ai.client.DockService', () => {
    let originalGetComponent, service;

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent;
        service              = Neo.create(DockService, {})
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent;
        service.destroy?.()
    });

    test('the operation vocabulary mirrors the dockZone.v1 executor verbatim', () => {
        expect(DockService.operations).toEqual([
            'addTab', 'moveItem', 'splitNode', 'resizeSplit',
            'detachItem', 'closeItem', 'setItemPinned', 'setItemAutoHidden'
        ])
    });

    test('the executor honors its reducer contract on a well-formed document (returns, never throws)', () => {
        const result = DockZoneModel.applyOperation({nodes: {}}, {operation: 'moveItem', itemId: 'missing', targetNodeId: 'nowhere'});

        expect(result).toHaveProperty('document');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true)
    });

    test('executeDockOperation rejects unknown operations fail-closed with the vocabulary enumerated', async () => {
        await expect(service.executeDockOperation({
            componentId: 'any',
            descriptor : {operation: 'teleportItem'}
        })).rejects.toThrow(/Unknown dock operation: teleportItem.*addTab, moveItem, splitNode, resizeSplit, detachItem, closeItem, setItemPinned, setItemAutoHidden/)
    });

    test('executeDockOperation rejects a missing descriptor fail-closed', async () => {
        await expect(service.executeDockOperation({componentId: 'any'}))
            .rejects.toThrow(/Unknown dock operation/)
    });

    test('resolveHolder throws for an unknown component id', async () => {
        Neo.getComponent = () => null;

        await expect(service.getDockTopology({componentId: 'ghost-1'}))
            .rejects.toThrow('Component not found: ghost-1')
    });

    test('resolveHolder throws for a component that holds no dock document', async () => {
        Neo.getComponent = () => ({id: 'plain-1'});

        await expect(service.getDockTopology({componentId: 'plain-1'}))
            .rejects.toThrow(/holds no dock document/)
    });

    test('getDockTopology returns the document plus the executable vocabulary', async () => {
        const document = {root: {type: 'split', items: []}};

        Neo.getComponent = () => ({dockZoneDocument: document, id: 'zone-1'});

        const result = await service.getDockTopology({componentId: 'zone-1'});

        expect(result.document).toBe(document);
        expect(result.operations).toEqual(DockService.operations)
    });

    test('executeDockOperation prefers the holder applyDockZoneOperation override and commits on success', async () => {
        const nextDocument = {root: {type: 'split', items: ['after']}};
        const descriptor   = {operation: 'setItemAutoHidden', itemId: 'pane-1', autoHidden: true};
        const seen         = {apply: null, change: null};

        const holder = {
            id              : 'zone-2',
            dockZoneDocument: {root: {type: 'split', items: ['before']}},
            applyDockZoneOperation(desc, source) {
                seen.apply = {desc, source};
                return {document: nextDocument, errors: []}
            },
            onDockZoneDocumentChange(doc, desc, source) {
                seen.change = {doc, desc, source}
            }
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({componentId: 'zone-2', descriptor});

        expect(seen.apply.desc).toBe(descriptor);
        expect(result.applied).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.document).toBe(nextDocument);
        expect(holder.dockZoneDocument).toBe(nextDocument);
        expect(seen.change.doc).toBe(nextDocument);
        expect(seen.change.desc).toBe(descriptor)
    });

    test('executeDockOperation surfaces executor errors without committing (the policy-rejection path)', async () => {
        const before = {root: {type: 'split', items: ['before']}};

        const holder = {
            id              : 'zone-3',
            dockZoneDocument: before,
            applyDockZoneOperation() {
                return {document: null, errors: ['setItemPinned rejected: pinnable === false']}
            }
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({
            componentId: 'zone-3',
            descriptor : {operation: 'setItemPinned', itemId: 'pane-1', pinned: true}
        });

        expect(result.applied).toBe(false);
        expect(result.errors).toEqual(['setItemPinned rejected: pinnable === false']);
        expect(holder.dockZoneDocument).toBe(before)
    });

    test('executeDockOperation falls back to the static reducer for a document-only holder', async () => {
        const holder = {
            id              : 'zone-4',
            dockZoneDocument: {nodes: {}},
            // no applyDockZoneOperation: the static DockZoneModel.applyOperation() path runs
        };

        Neo.getComponent = () => holder;

        const result = await service.executeDockOperation({
            componentId: 'zone-4',
            descriptor : {operation: 'moveItem', itemId: 'missing', targetNodeId: 'nowhere'}
        });

        // an empty node map cannot satisfy the move: the reducer reports errors, nothing commits
        expect(result.applied).toBe(false);
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result.errors.length).toBeGreaterThan(0)
    });

    test('a malformed holder document surfaces as structured errors, never a raw RPC crash', async () => {
        const malformed = {};

        Neo.getComponent = () => ({id: 'zone-5', dockZoneDocument: malformed});

        const result = await service.executeDockOperation({
            componentId: 'zone-5',
            descriptor : {operation: 'moveItem', itemId: 'x', targetNodeId: 'y'}
        });

        expect(result.applied).toBe(false);
        expect(result.errors[0]).toMatch(/Dock operation failed before commit:/);
        expect(result.document).toBe(malformed)
    });
});
