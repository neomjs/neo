import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockWorkspaceSetTransactionTest'}});

import {expect, test}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import TransactionManager       from '../../../../src/manager/Transaction.mjs';
import WorkspaceDocument        from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import {createDockWorkspaceSet} from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';

/** @summary Creates a valid, item-disjoint dock document. @param {String} key @param {String} title @returns {Object} */
function document(key, title = 'before') {
    return {
        schema: WorkspaceDocument.SCHEMA,
        root  : 'root',
        items : {[key]: {componentRef: key, title, kind: 'panel'}},
        nodes : {root: {type: 'tabs', items: [key], activeItemId: key}}
    }
}

/** @summary Exercises the dock adapter through the real Group writer and document validator. */
test.describe.serial('Dock WorkspaceSet transaction participants', () => {
    let binding, groupId, set;

    test.beforeEach(() => {
        binding = TransactionManager.bind({windowId: 'workspace-set-transaction-root', workspaceKey: 'main'});
        groupId = binding.groupId;
        TransactionManager.setHistoryDepth({groupId, depth: 5});
        const popup = TransactionManager.reserve({groupId, workspaceKey: 'popup'});
        TransactionManager.bind({...popup, windowId: 'workspace-set-transaction-popup'});
        set = createDockWorkspaceSet({manager: TransactionManager, getGroupId: () => groupId, documentModel: WorkspaceDocument})
    });

    test.afterEach(() => TransactionManager.retireGroup(groupId));

    /** @summary Registers a document holder without reading it during registration. @param {String} key @param {Object} options @returns {Object} */
    function holder(key, {project, fail} = {}) {
        const state = {document: document(key), reads: 0, writes: []};
        state.seams = {
            getDocument: () => { state.reads++; return state.document },
            setDocument: value => {
                state.writes.push(value);
                state.document = value;
                if (fail?.(value)) throw new Error('second setter refused')
            },
            project
        };
        expect(set.register(key, state.seams)).toBe(true);
        expect(state.reads).toBe(0);
        return state
    }

    const write = (workspaces, options = {}) => set.write(workspaces, {cause: 'replace-workspaces', provenance: {origin: 'unit'}, ...options});

    test('two valid documents commit once through the Group; projection observes both committed owners', async () => {
        const projected = [];
        const main      = holder('main', {project: context => projected.push({
            transactionId: context.transactionId,
            main         : main.document.items.main.title,
            popup        : popup.document.items.popup.title,
            count        : TransactionManager.get(groupId).history.count
        })});
        const popup    = holder('popup');
        const mainNext = document('main', 'after'), popupNext = document('popup', 'after');

        const result = await write({popup: popupNext, main: mainNext}, {descriptor: {kind: 'paired-layout'}});

        expect(main.document).toEqual(mainNext);
        expect(popup.document).toEqual(popupNext);
        expect(main.document).not.toBe(mainNext);
        expect(main.document).not.toBe(result.row.participants[0].after);
        expect(result.row.kind).toBe('paired-layout');
        expect(result.row.participants.map(entry => entry.workspaceKey)).toEqual(['main', 'popup']);
        expect(result.row.participants[0].before).toEqual(document('main'));
        expect(result.snapshot.participants).toEqual({main: mainNext, popup: popupNext});
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(1);
        await expect.poll(() => projected.length).toBe(1);
        expect(projected[0]).toEqual({transactionId: result.transactionId, main: 'after', popup: 'after', count: 1})
    });

    test('an invalid second candidate refuses before either document is written', async () => {
        const main    = holder('main'), popup = holder('popup');
        const invalid = {...document('popup'), root: 'missing'};

        await expect(write({main: document('main', 'after'), popup: invalid})).rejects.toThrow(/invalid dock document/);

        expect(main.writes).toEqual([]);
        expect(popup.writes).toEqual([]);
        expect(main.document).toEqual(document('main'));
        expect(popup.document).toEqual(document('popup'));
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0)
    });

    test('a second setter that mutates then throws compensates both documents and restores reference revisions', async () => {
        let   refuse = true;
        const main   = holder('main');
        const popup  = holder('popup', {fail: value => refuse && value.items.popup.title === 'after'});

        await expect(write({main: document('main', 'after'), popup: document('popup', 'after')})).rejects.toThrow('second setter refused');

        expect(main.document).toEqual(document('main'));
        expect(popup.document).toEqual(document('popup'));
        expect(main.writes.map(value => value.items.main.title)).toEqual(['after', 'before']);
        expect(popup.writes.map(value => value.items.popup.title)).toEqual(['after', 'before']);
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(0);
        expect(TransactionManager.getParticipant(groupId, 'popup').capture().revision).toBe(0);
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0);
        expect(TransactionManager.get(groupId).snapshot ?? null).toBeNull();

        refuse = false;
        await write({main: document('main', 'next'), popup: document('popup', 'next')});
        expect(TransactionManager.get(groupId).history.count).toBe(1);
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(1)
    });

    test('a generation changing during preparation refuses before document adoption', async () => {
        const main        = holder('main'), popup = holder('popup');
        const participant = TransactionManager.getParticipant(groupId, 'main'), prepare = participant.prepare;
        let entered, release;
        const started = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
        participant.prepare = async (...args) => { const candidate = prepare(...args); entered(); await gate; return candidate };

        const pending = write({main: document('main', 'after'), popup: document('popup', 'after')});
        await started;
        TransactionManager.release(binding.windowId);
        TransactionManager.bind({...binding, windowId: 'workspace-set-transaction-reloaded'});
        expect(TransactionManager.getBinding(groupId, 'main').generation).toBe(2);
        release();

        await expect(pending).rejects.toThrow(/changed/);
        expect(main.writes).toEqual([]);
        expect(popup.writes).toEqual([]);
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0)
    });

    test('a document key distinct from its window binding rejects a reload during preparation', async () => {
        const main = holder('workstation-main');
        set.register('workstation-main', {...main.seams, bindingKey: 'main', componentId: 'live-workspace'});
        const participant = TransactionManager.getParticipant(groupId, 'workstation-main');
        const prepare     = participant.prepare;
        let entered, release;
        const started = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
        participant.prepare = async (...args) => { const candidate = prepare(...args); entered(); await gate; return candidate };

        const pending = write({'workstation-main': document('workstation-main', 'after')});
        await started;
        TransactionManager.release(binding.windowId);
        TransactionManager.bind({...binding, windowId: 'workspace-set-transaction-reloaded'});
        release();

        await expect(pending).rejects.toThrow(/changed/);
        expect(main.writes).toEqual([]);
        expect(participant.capture().generation).toBe(2);
        expect(participant.componentId).toBe('live-workspace');
        expect(participant.capture()).not.toHaveProperty('componentId');
        participant.prepare = prepare;
        const result = await write({'workstation-main': document('workstation-main', 'next')});
        expect(JSON.stringify(result.snapshot)).not.toContain('live-workspace')
    });

    test('reference revisions observe outside document replacements, while an explicit revision getter remains authoritative', () => {
        const main        = holder('main');
        const participant = TransactionManager.getParticipant(groupId, 'main');
        expect(participant.capture().revision).toBe(0);
        main.document = WorkspaceDocument.clone(main.document);
        expect(participant.capture().revision).toBe(1);
        expect(participant.capture().revision).toBe(1);

        let revision = 42, reads = 0;
        set.register('main', {...main.seams, getRevision: () => { reads++; return revision }});
        expect(reads).toBe(0);
        const explicit = TransactionManager.getParticipant(groupId, 'main');
        expect(explicit.capture().revision).toBe(42);
        revision++;
        expect(explicit.capture().revision).toBe(43)
    });

    test('read-only slots contribute capture to the Group snapshot but cannot receive a write', async () => {
        const main = holder('main'), popup = holder('popup');
        set.register('popup', {getDocument: popup.seams.getDocument});
        const readOnly = TransactionManager.getParticipant(groupId, 'popup');
        expect(typeof readOnly.capture).toBe('function');
        expect(readOnly.adopt).toBeUndefined();
        expect(readOnly.compensate).toBeUndefined();

        const result = await write({main: document('main', 'after')});
        expect(result.snapshot.participants.popup).toEqual(document('popup'));
        await expect(write({popup: document('popup', 'after')})).rejects.toThrow(/compensatable/);
        expect(main.document.items.main.title).toBe('after');
        expect(popup.writes).toEqual([])
    });

    test('the model seam is required by queued writes without changing synchronous adoption', async () => {
        const main   = holder('main');
        const legacy = createDockWorkspaceSet({manager: TransactionManager, getGroupId: () => groupId});
        legacy.register('main', main.seams);

        expect(legacy.adoptAll({main: document('main', 'synchronous')})).toBe(true);
        await expect(legacy.write({main: document('main', 'queued')}, {cause: 'test'})).rejects.toThrow(/injected documentModel/);
        expect(main.document.items.main.title).toBe('synchronous');
        expect(main.writes).toHaveLength(1)
    })
});
