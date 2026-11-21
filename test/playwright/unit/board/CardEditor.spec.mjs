import {setup} from '../../setup.mjs';

const appName = 'BoardCardEditorTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

Neo.main.DomAccess.selectNode    ??= () => {};
Neo.main.DomAccess.syncModalMask ??= () => {};
Neo.main.DomAccess.trapFocus     ??= () => {};

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import CheckBox        from '../../../../src/form/field/CheckBox.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TextField       from '../../../../src/form/field/Text.mjs';
import Board           from '../../../../src/board/Container.mjs';
import CardEditor      from '../../../../src/board/CardEditor.mjs';
import CardModel       from '../../../../src/board/CardModel.mjs';

/**
 * @summary Unit suite for `Neo.board.Card` inline title editing and `Neo.board.CardEditor` record form diffing:
 * inline Enter / Escape / blur semantics, opening from the card menu button or Enter on a focused card, one reused
 * editor instance per board, exact diff-only `record.set` payload on save, routing status and lane changes through
 * `board.moveCard` in a single write, and rendering unknown model field types as `Neo.form.field.Text`.
 */
const
    cards = () => [
        {id: 'c1', title: 'Atlas feed',    description: 'Initial feed', status: 'backlog',     order: 1000, tags: ['feed', 'ops'], progress: 10, assignees: ['Ada Lovelace', {name: 'Grace Hopper'}], color: '#5eead4', dueDate: '2026-11-15'},
        {id: 'c2', title: 'Beacon trace',  description: 'Trace beacon', status: 'backlog',     order: 2000},
        {id: 'c3', title: 'Cipher deploy', description: 'Deploy unit',  status: 'in-progress', order: 1000, progress: 60, color: '#f59e0b'},
        {id: 'c4', title: 'Delta vessel',  description: '',             status: 'done',        order: 1000}
    ],
    columns     = [{status: 'backlog', title: 'Backlog'}, {status: 'in-progress', title: 'In progress'}, {status: 'done', title: 'Done'}],
    createStore = (data=cards(), model=CardModel) => Neo.create(Store, {keyProperty: 'id', model, data}),
    createBoard = config => Neo.create(Board, {appName, columns, ...config}),
    recordChanges = store => {
        const events = [];
        store.on('recordChange', ({fields, record}) => events.push({
            id     : record.id,
            changes: Object.fromEntries(fields.map(field => [field.name, field.value])),
            names  : fields.map(field => field.name).sort()
        }));
        return events
    };

test.describe('Neo.board.Card inline title editing & Neo.board.CardEditor', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('inline edit: double-click or F2 opens TextField; Enter commits changed title in one recordChange; Escape and unchanged blur write nothing', async () => {
        store = createStore();
        board = createBoard({store});

        for (let i = 0; i < 10 && !board.sortZone; i++) {
            await Promise.resolve()
        }

        const
            card   = board.getCard('c1'),
            events = recordChanges(store);

        // Start inline edit via double-click on the title node
        card.onTitleDoubleClick();

        expect(card.isEditingTitle).toBe(true);
        expect(card.inlineEditor).toBeInstanceOf(TextField);
        expect(card.inlineEditor.cls).toContain('neo-board-card-inline-editor');
        expect(card.inlineEditor.value).toBe('Atlas feed');
        expect(card.vdom.cn[0]).toEqual(card.inlineEditor.createVdomReference());

        // Drag zone ignores a card while inline editing or when starting on the inline editor / menu button
        expect(board.sortZone.getCardFromPath([{id: card.id}])).toBeNull();
        expect(board.sortZone.getCardFromPath([{id: `${card.id}__inline-editor`, cls: ['neo-board-card-inline-editor']}, {id: card.id}])).toBeNull();
        expect(board.sortZone.getCardFromPath([{id: `${card.id}__menu`, cls: ['neo-board-card-menu-button']}, {id: card.id}])).toBeNull();

        // Enter with a changed title commits exactly one recordChange with {title}
        card.inlineEditor.value = 'Atlas feed v2';
        card.onInlineKeyDown({key: 'Enter'});

        expect(card.isEditingTitle).toBe(false);
        expect(store.get('c1').title).toBe('Atlas feed v2');
        expect(card.vdom.cn[0].text).toBe('Atlas feed v2');
        expect(events).toEqual([{
            id     : 'c1',
            changes: {title: 'Atlas feed v2'},
            names  : ['title']
        }]);

        // Start inline edit via F2 on a card whose inlineEditor is still null, with a real DOM path (including window `{}`)
        const card2 = board.getCard('c2');
        expect(card2.inlineEditor).toBeNull();
        card2.onCardKeyDown({key: 'F2', path: [{id: card2.id}, {}]});
        expect(card2.isEditingTitle).toBe(true);
        card2.cancelTitleEdit();

        // Start inline edit via F2 on the focused card, then cancel with Escape -> zero writes
        card.onCardKeyDown({key: 'F2', path: [{id: card.id}, {}]});
        expect(card.isEditingTitle).toBe(true);

        // Bubbled Enter from the inline editor path does not open CardEditor
        card.onCardKeyDown({
            key : 'Enter',
            path: [{id: `${card.id}__inline-editor`, cls: ['neo-board-card-inline-editor']}, {id: card.id}, {}]
        });
        expect(board.cardEditor).toBeNull();

        card.inlineEditor.value = 'Discarded title';
        card.onInlineKeyDown({key: 'Escape'});

        expect(card.isEditingTitle).toBe(false);
        expect(store.get('c1').title).toBe('Atlas feed v2');
        expect(card.vdom.cn[0].text).toBe('Atlas feed v2');
        expect(events).toHaveLength(1);

        // Blur with no change -> zero writes
        card.startTitleEdit();
        card.onInlineFocusLeave();

        expect(card.isEditingTitle).toBe(false);
        expect(events).toHaveLength(1);

        // Blur with a changed title -> commits once
        card.startTitleEdit();
        card.inlineEditor.value = 'Atlas feed v3';
        card.onInlineFocusLeave();

        expect(card.isEditingTitle).toBe(false);
        expect(store.get('c1').title).toBe('Atlas feed v3');
        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({
            id     : 'c1',
            changes: {title: 'Atlas feed v3'},
            names  : ['title']
        })
    });

    test('opens from the card menu button and from Enter on a focused card, reusing one CardEditor instance per board', () => {
        store = createStore();
        board = createBoard({store});

        const
            card1 = board.getCard('c1'),
            card2 = board.getCard('c2');

        expect(card1.vdom.cn.at(-1).cls).toContain('neo-board-card-menu-button');

        // Open from menu button on card1
        card1.onMenuButtonClick();

        const editor = board.cardEditor;

        expect(editor).toBeInstanceOf(CardEditor);
        expect(editor.hidden).toBe(false);
        expect(editor.record).toBe(store.get('c1'));
        expect(editor.animateTargetId).toBe(card1.id);
        expect(editor.getFieldValue('title')).toBe('Atlas feed');
        expect(editor.getFieldValue('description')).toBe('Initial feed');
        expect(editor.getFieldValue('status')).toBe('backlog');
        expect(editor.getFieldValue('progress')).toBe(10);
        expect(editor.getFieldValue('color')).toBe('#5eead4');
        expect(editor.getFieldValue('dueDate')).toBe('2026-11-15');

        editor.hide();
        expect(editor.hidden).toBe(true);

        // Open from Enter key on focused card2 -> reuses the exact same editor instance
        card2.onCardKeyDown({key: 'Enter'});

        expect(board.cardEditor).toBe(editor);
        expect(editor.hidden).toBe(false);
        expect(editor.record).toBe(store.get('c2'));
        expect(editor.animateTargetId).toBe(card2.id);
        expect(editor.getFieldValue('title')).toBe('Beacon trace');
        expect(editor.getFieldValue('description')).toBe('Trace beacon');

        // Direct record assignment (editor.record = card.record) also syncs the form
        editor.record = store.get('c3');
        expect(editor.getFieldValue('title')).toBe('Cipher deploy');
        expect(editor.getFieldValue('status')).toBe('in-progress');
        expect(editor.getFieldValue('progress')).toBe(60)
    });

    test('Save with only description changed writes one set({description}); Save with status changed routes through moveCard in one set', () => {
        store = createStore();
        board = createBoard({store});

        const
            card1  = board.getCard('c1'),
            events = recordChanges(store),
            moves  = [];

        board.on('cardMove', data => moves.push(data));

        // 1. Save with only description changed -> untouched assignees/tags/status/progress are NOT rewritten
        const editor = card1.openEditor();

        editor.setFieldValue('description', 'Updated feed notes');
        editor.save();

        expect(editor.hidden).toBe(true);
        expect(store.get('c1').description).toBe('Updated feed notes');
        expect(events).toEqual([{
            id     : 'c1',
            changes: {description: 'Updated feed notes'},
            names  : ['description']
        }]);
        expect(moves).toHaveLength(0);

        // 2. Save with status changed + progress + title -> one single set through moveCard (appended to in-progress)
        card1.openEditor();
        editor.setFieldValue('status', 'in-progress');
        editor.setFieldValue('progress', 75);
        editor.setFieldValue('title', 'Atlas feed promoted');
        editor.save();

        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({
            id     : 'c1',
            changes: {
                order   : 2000,
                progress: 75,
                status  : 'in-progress',
                title   : 'Atlas feed promoted'
            },
            names  : ['order', 'progress', 'status', 'title']
        });
        expect(moves).toHaveLength(1);
        expect(moves[0].from).toEqual({index: 0, lane: null, status: 'backlog'});
        expect(moves[0].to).toEqual({index: 1, lane: null, status: 'in-progress'});
        expect(board.getColumn('in-progress').body.items.map(item => item.record.id)).toEqual(['c3', 'c1'])
    });

    test('Save against a Record a reload or a Store replacement retired writes nothing; the current Record takes its place', () => {
        store = createStore();
        board = createBoard({store});

        const
            editor  = board.getCard('c1').openEditor(),
            retired = store.get('c1'),
            other   = createStore([{id: 'x1', title: 'Other', status: 'backlog', order: 1000}]);

        // 1. A same-key reload: the edit was made against the retired Record
        editor.setFieldValue('title', 'Stale title');
        store.setData(cards());

        const
            current = store.get('c1'),
            events  = recordChanges(store);

        expect(current).not.toBe(retired);
        expect(editor.save()).toBeNull();
        expect(retired.title).toBe('Atlas feed');
        expect(current.title).toBe('Atlas feed');
        expect(events).toEqual([]);
        expect(editor.record).toBe(current);
        expect(editor.getFieldValue('title')).toBe('Atlas feed');
        expect(editor.hidden).toBe(false);

        // 2. The control: a Save against the current Record writes once
        editor.setFieldValue('title', 'Fresh title');

        expect(editor.save()).toEqual({title: 'Fresh title'});
        expect(events).toEqual([{id: 'c1', changes: {title: 'Fresh title'}, names: ['title']}]);
        expect(editor.hidden).toBe(true);

        // 3. A replacement Store without the key: nothing to write to, the editor closes
        board.getCard('c1').openEditor();
        editor.setFieldValue('title', 'Orphaned title');
        board.store = other;

        expect(editor.save()).toBeNull();
        expect(current.title).toBe('Fresh title');
        expect(other.get('x1').title).toBe('Other');
        expect(editor.hidden).toBe(true);

        board.destroy();
        board = null;
        other.destroy()
    });

    test('Save with lane changed routes through moveCard when laneField is set', () => {
        store = createStore([
            {id: 'l1', title: 'Alpha task', status: 'backlog', lane: 'urgent',   order: 1000},
            {id: 'l2', title: 'Beta task',  status: 'backlog', lane: 'standard', order: 1000}
        ]);
        board = createBoard({
            store,
            laneField: 'lane',
            columns  : [
                {status: 'backlog', laneValue: 'urgent',   title: 'Backlog Urgent'},
                {status: 'backlog', laneValue: 'standard', title: 'Backlog Standard'}
            ]
        });

        const
            events = recordChanges(store),
            editor = board.openCardEditor('l1');

        expect(editor.getField('lane').hidden).toBe(false);
        expect(editor.getFieldValue('lane')).toBe('urgent');

        editor.setFieldValue('lane', 'standard');
        editor.save();

        expect(events).toEqual([{
            id     : 'l1',
            changes: {lane: 'standard', order: 2000},
            names  : ['lane', 'order']
        }])
    });

    test('Cancel, Escape, and Save with no change write nothing', () => {
        store = createStore();
        board = createBoard({store});

        const
            card   = board.getCard('c1'),
            events = recordChanges(store),
            editor = card.openEditor();

        // Save with no change -> no write
        expect(editor.save()).toBeNull();
        expect(events).toEqual([]);

        // Edit fields then click the Cancel button -> binds handlerScope and writes nothing
        card.openEditor();
        editor.setFieldValue('title', 'Transient edit');
        editor.setFieldValue('description', 'Transient description');
        editor.footerToolbar.items[0].useRippleEffect = false;
        editor.footerToolbar.items[0].onClick({});

        expect(editor.hidden).toBe(true);
        expect(store.get('c1').title).toBe('Atlas feed');
        expect(events).toEqual([]);

        // Edit fields then press Escape -> no write
        card.openEditor();
        expect(editor.getFieldValue('title')).toBe('Atlas feed');
        editor.setFieldValue('title', 'Escape edit');
        editor.onKeyDownEscape();

        expect(editor.hidden).toBe(true);
        expect(store.get('c1').title).toBe('Atlas feed');
        expect(events).toEqual([]);

        // Edit field then click the Save button -> binds handlerScope, writes diff, and hides
        card.openEditor();
        editor.setFieldValue('title', 'Saved by button click');
        editor.footerToolbar.items[1].useRippleEffect = false;
        editor.footerToolbar.items[1].onClick({});

        expect(editor.hidden).toBe(true);
        expect(store.get('c1').title).toBe('Saved by button click');
        expect(events).toEqual([{
            id     : 'c1',
            changes: {title: 'Saved by button click'},
            names  : ['title']
        }])
    });

    test('unknown model field types render as TextField and commit in the same single set', () => {
        class CustomCardModel extends Model {
            static config = {
                className  : 'Test.Unit.Board.CardEditor.CustomCardModel',
                keyProperty: 'id',
                fields     : [
                    ...CardModel.config.fields,
                    {name: 'vesselCode', type: 'CustomVesselType'}
                ]
            }
        }
        CustomCardModel = Neo.setupClass(CustomCardModel);

        store = createStore([
            {id: 'x1', title: 'Custom card', status: 'backlog', order: 1000, vesselCode: 'VSL-01'}
        ], CustomCardModel);
        board = createBoard({store});

        const
            events = recordChanges(store),
            editor = board.openCardEditor('x1'),
            field  = editor.getField('vesselCode');

        expect(field).toBeInstanceOf(TextField);
        expect(field.value).toBe('VSL-01');

        editor.setFieldValue('vesselCode', 'VSL-09');
        editor.save();

        expect(events).toEqual([{
            id     : 'x1',
            changes: {vesselCode: 'VSL-09'},
            names  : ['vesselCode']
        }]);
        expect(store.get('x1').vesselCode).toBe('VSL-09');

        const editorId = editor.id;
        board.destroy();
        expect(InstanceManager.get(editorId)).toBeFalsy()
    })
});

/**
 * @summary A model of its own, as an app brings one: a work item with dates, a person and a Boolean, and none of
 * `CardModel`'s assignees, tags, color or due date.
 * @class Test.Unit.Board.CardEditor.WorkItemModel
 * @extends Neo.data.Model
 */
class WorkItemModel extends Model {
    static config = {
        className  : 'Test.Unit.Board.CardEditor.WorkItemModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id'},
            {name: 'title',       type: 'String'},
            {name: 'description', type: 'String'},
            {name: 'status',      type: 'String'},
            {name: 'order',       type: 'Float'},
            {name: 'progress',    type: 'Int', defaultValue: 0},
            {name: 'startDate',   type: 'Date'},
            {name: 'allDay',      type: 'Boolean', defaultValue: false},
            {name: 'resourceId'},
            {name: 'label',       calculate: data => `${data.title} (${data.resourceId})`}
        ]
    }
}

Neo.setupClass(WorkItemModel);

/**
 * @summary A model whose standard `progress` is calculated from another field.
 * @class Test.Unit.Board.CardEditor.CalculatedProgressModel
 * @extends Neo.data.Model
 */
class CalculatedProgressModel extends Model {
    static config = {
        className  : 'Test.Unit.Board.CardEditor.CalculatedProgressModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id'},
            {name: 'title',    type: 'String'},
            {name: 'status',   type: 'String'},
            {name: 'order',    type: 'Float'},
            {name: 'units',    type: 'Int', defaultValue: 0},
            {name: 'progress', type: 'Int', calculate: data => data.units * 2}
        ]
    }
}

Neo.setupClass(CalculatedProgressModel);

/**
 * @summary The smallest model a board reads: a title, a status and an order.
 * @class Test.Unit.Board.CardEditor.TitleStatusModel
 * @extends Neo.data.Model
 */
class TitleStatusModel extends Model {
    static config = {
        className  : 'Test.Unit.Board.CardEditor.TitleStatusModel',
        keyProperty: 'id',
        fields     : [{name: 'id'}, {name: 'title', type: 'String'}, {name: 'status', type: 'String'}, {name: 'order', type: 'Float'}]
    }
}

Neo.setupClass(TitleStatusModel);

const workItems = () => [
    {id: 'w1', title: 'Build the booking screens', status: 'backlog', order: 1000, progress: 45, startDate: new Date(Date.UTC(2026, 10, 15)), resourceId: 'priya'},
    {id: 'w2', title: 'Write the test plan',       status: 'done',    order: 1000, progress: 100, allDay: true, resourceId: 'lena'}
];

test.describe('Neo.board.CardEditor follows the model it edits', () => {
    let board, store;

    test.afterEach(() => {
        board?.destroy();
        store?.destroy();
        board = store = null
    });

    test('a model of its own gets the standard fields it declares, then its others under readable labels', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({store});

        const editor = board.openCardEditor('w1');

        expect([...editor.fieldMap.keys()], 'no assignees, tags, color or due date; no key, order or calculated field')
            .toEqual(['title', 'description', 'status', 'progress', 'startDate', 'allDay', 'resourceId']);
        expect(['startDate', 'allDay', 'resourceId'].map(name => editor.getField(name).labelText)).toEqual(['Start date', 'All day', 'Resource id']);
        expect(editor.getField('allDay')).toBeInstanceOf(CheckBox)
    });

    test('every text-like field labels on top, as the status select does, unless its config names its own side', () => {
        store = createStore();
        board = createBoard({store});

        const editor = board.openCardEditor('c1');

        expect(['title', 'description', 'assignees', 'tags', 'progress', 'color', 'dueDate'].map(name => editor.getField(name).labelPosition))
            .toEqual(Array(7).fill('top'));

        board.destroy();
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({store, cardEditorConfig: {fields: ['title', {module: TextField, name: 'resourceId', labelPosition: 'left'}, 'startDate']}});

        const custom = board.openCardEditor('w1');

        expect(['title', 'resourceId', 'startDate'].map(name => custom.getField(name).labelPosition), 'a model field takes the top too; a named side stays')
            .toEqual(['top', 'left', 'top'])
    });

    test('a Boolean field is a check box, and its save writes one Boolean', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({store});

        const events = recordChanges(store),
              editor = board.openCardEditor('w1');

        expect(editor.getFieldValue('allDay')).toBe(false);

        // What a click on the box does
        editor.getField('allDay').checked = true;
        editor.save();

        expect(events).toEqual([{id: 'w1', changes: {allDay: true}, names: ['allDay']}]);
        expect(board.openCardEditor('w2').getField('allDay').checked, 'a checked record opens checked').toBe(true)
    });

    test('a date the user leaves alone writes nothing', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({store});

        const editor = board.openCardEditor('w1');

        editor.setFieldValue('progress', 60);

        expect(editor.save(), 'only the edited field, not the untouched start date').toEqual({progress: 60});
        expect(store.get('w1').startDate.toISOString()).toBe('2026-11-15T00:00:00.000Z')
    });

    test('`fields` names the form in order: a name picks a standard or model field, an object is a config; a save writes the changed ones', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({store, cardEditorConfig: {
            fields: ['title', 'status', {module: TextField, labelText: 'Person', name: 'resourceId'}, 'progress', 'startDate']
        }});

        const events = recordChanges(store),
              editor = board.openCardEditor('w1');

        expect([...editor.fieldMap.keys()]).toEqual(['title', 'status', 'resourceId', 'progress', 'startDate']);
        expect([editor.getField('resourceId').labelText, editor.getField('startDate').labelText]).toEqual(['Person', 'Start date']);

        editor.setFieldValue('resourceId', 'tom');
        editor.setFieldValue('progress', 60);

        expect(editor.save(), 'the save writes the two edited fields').toEqual({progress: 60, resourceId: 'tom'});
        expect(events.map(event => event.names), 'in one record change, which the calculated label follows')
            .toEqual([['label', 'progress', 'resourceId']])
    });

    test('a calculated standard field is not offered, so no edit to it is lost; the field it reads is', () => {
        store = createStore([{id: 'p1', title: 'Measured card', status: 'backlog', order: 1000, units: 25}], CalculatedProgressModel);
        board = createBoard({store});

        const editor = board.openCardEditor('p1');

        expect([...editor.fieldMap.keys()]).toEqual(['title', 'status', 'units']);

        editor.setFieldValue('units', 35);

        expect(editor.save()).toEqual({units: 35});
        expect(store.get('p1').progress, 'the calculated field follows its input').toBe(70)
    });

    test('a field `fields` supplies as a config named lane is an ordinary field: shown, and saved without swimlanes', () => {
        store = createStore();
        board = createBoard({store, cardEditorConfig: {
            fields: ['title', 'status', {module: TextField, labelText: 'Lane', name: 'lane'}]
        }});

        const editor = board.openCardEditor('c1');

        expect(editor.getField('lane').hidden, 'the board has no swimlanes, and the field is not their control').toBe(false);

        editor.setFieldValue('lane', 'B');

        expect(editor.save()).toEqual({lane: 'B'});
        expect(store.get('c1').lane).toBe('B')
    });

    test('a store with another model rebuilds the reused editor\'s derived form and retires the fields it lacks', () => {
        store = createStore();
        board = createBoard({store});

        const editor = board.openCardEditor('c1'),
              first  = store,
              tagsId = editor.getField('tags').id;

        store = board.store = Neo.create(Store, {keyProperty: 'id', model: TitleStatusModel, data: [{id: 'n1', title: 'Next', status: 'backlog', order: 1000}]});
        first.destroy();

        expect(board.openCardEditor('n1'), 'the board keeps its one editor').toBe(editor);
        expect([...editor.fieldMap.keys()]).toEqual(['title', 'status']);
        expect(InstanceManager.get(tagsId), 'the tags field of the first model retired').toBeFalsy();

        editor.setFieldValue('title', 'Renamed');

        expect(editor.save()).toEqual({title: 'Renamed'})
    });

    test('a CardModel store keeps every standard field, in the order it always had', () => {
        store = createStore();
        board = createBoard({store});

        expect([...board.openCardEditor('c1').fieldMap.keys()])
            .toEqual(['title', 'description', 'status', 'lane', 'assignees', 'tags', 'progress', 'color', 'dueDate'])
    });

    test('defaults headerConfig to {actions: [\'close\']} and omits maximize button unless explicitly requested', () => {
        store = createStore();
        board = createBoard({store});

        const editor = board.openCardEditor('c1');

        expect(editor.headerConfig).toEqual({actions: ['close']});
        expect(editor.headerToolbar.actions).toEqual(['close']);

        board.destroy();
        board = createBoard({store, cardEditorConfig: {headerConfig: {actions: ['maximize', 'close']}}});

        const custom = board.openCardEditor('c1');

        expect(custom.headerConfig).toEqual({actions: ['maximize', 'close']});
        expect(custom.headerToolbar.actions).toEqual(['maximize', 'close'])
    });

    test('fieldLabels merges shallowly on construction and customizes standard and model-derived field labels', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({
            store,
            cardEditorConfig: {
                fieldLabels: {
                    assignees: 'Recruiter',
                    startDate: 'Begins',
                    status   : 'Stage',
                    tags     : 'Role',
                    title    : 'Name'
                }
            }
        });

        const editor = board.openCardEditor('w1');

        expect(editor.fieldLabels).toEqual({
            assignees  : 'Recruiter',
            color      : 'Color',
            description: 'Description',
            dueDate    : 'Due date',
            lane       : 'Lane',
            progress   : 'Progress',
            startDate  : 'Begins',
            status     : 'Stage',
            tags       : 'Role',
            title      : 'Name'
        });

        expect(editor.getField('title').labelText).toBe('Name');
        expect(editor.getField('status').labelText).toBe('Stage');
        expect(editor.getField('startDate').labelText).toBe('Begins');
        expect(editor.getField('progress').labelText).toBe('Progress')
    });

    test('fieldLabels respects custom statusField, domain-keyed and role-keyed overrides', () => {
        store = createStore([
            {id: 'l1', title: 'Alpha task', status: 'backlog', lane: 'urgent', order: 1000}
        ]);
        board = createBoard({
            laneField       : 'lane',
            statusField     : 'column',
            store,
            columns         : [
                {status: 'backlog', laneValue: 'urgent', title: 'Backlog Urgent'}
            ],
            cardEditorConfig: {
                fieldLabels: {
                    column: 'Pipeline Column',
                    lane  : 'Swimlane Section'
                }
            }
        });

        let editor = board.openCardEditor('l1');

        expect(editor.getField('column').labelText).toBe('Pipeline Column');
        expect(editor.getField('lane').labelText).toBe('Swimlane Section');

        board.destroy();
        board = createBoard({
            statusField     : 'column',
            store,
            cardEditorConfig: {
                fieldLabels: {
                    status: 'Role-keyed Stage'
                }
            }
        });

        editor = board.openCardEditor('l1');
        expect(editor.getField('column').labelText).toBe('Role-keyed Stage')
    });

    test('runtime fieldLabels update merges shallowly, updates labels in place and preserves unsaved draft values', () => {
        store = createStore(workItems(), WorkItemModel);
        board = createBoard({
            store,
            cardEditorConfig: {
                fieldLabels: {
                    startDate: 'Begins',
                    title    : 'Name'
                }
            }
        });

        const editor = board.openCardEditor('w1');

        expect(editor.getField('title').labelText).toBe('Name');
        expect(editor.getField('startDate').labelText).toBe('Begins');
        expect(editor.getField('status').labelText).toBe('Status');
        expect(editor.getFieldValue('title')).toBe('Build the booking screens');

        editor.setFieldValue('title', 'Unsaved title');
        expect(store.get('w1').title).toBe('Build the booking screens');

        editor.set({fieldLabels: {status: 'Stage'}});

        expect(editor.fieldLabels).toEqual({
            assignees  : 'Assignees',
            color      : 'Color',
            description: 'Description',
            dueDate    : 'Due date',
            lane       : 'Lane',
            progress   : 'Progress',
            startDate  : 'Begins',
            status     : 'Stage',
            tags       : 'Tags',
            title      : 'Name'
        });
        expect(editor.getField('title').labelText).toBe('Name');
        expect(editor.getField('startDate').labelText).toBe('Begins');
        expect(editor.getField('status').labelText).toBe('Stage');
        expect(editor.getField('description').labelText).toBe('Description');
        expect(editor.getFieldValue('title'), 'unsaved draft survives runtime label update').toBe('Unsaved title');

        expect(editor.save()).toEqual({title: 'Unsaved title'});
        expect(store.get('w1').title).toBe('Unsaved title')
    });
});
