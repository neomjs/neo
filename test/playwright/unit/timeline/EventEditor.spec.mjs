import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import EventEditor    from '../../../../src/timeline/EventEditor.mjs';
import Events         from '../../../../src/timeline/store/Events.mjs';
import TimeAxis       from '../../../../src/timeline/TimeAxis.mjs';
import TimeAxisHeader from '../../../../src/timeline/TimeAxisHeader.mjs';

const appName = 'TimelineEditorTest';
setup({
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false},
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false}
});

test.beforeEach(() => {
    for (const name of ['selectNode', 'syncModalMask', 'trapFocus']) {
        if (!Neo.main.DomAccess[name]) Neo.main.DomAccess[name] = () => {}
    }
});

test('header labels and editor input use the same custom axis clock', () => {
    const
        axis    = Neo.create(TimeAxis, {timeZone: null}),
        header  = Neo.create(TimeAxisHeader, {appName, timeAxis: axis}),
        editor  = Neo.create(EventEditor, {appName, owner: {timeAxis: axis}}),
        instant = new Date('2026-11-09T02:00Z'),
        wall    = new Date('2031-04-05T16:17Z'),
        tick    = {date: instant, unit: 'hour'};

    // Supply a civil clock that cannot be mistaken for the host's timezone.
    axis.wallTime = value => +value === +instant ? wall : value;
    axis.fromWallTime = value => +value === +wall ? instant : value;
    try {
        expect(header.formatMajorTick(tick)).toBe('2031-04-05 16:00');
        expect(header.formatMinorTick(tick)).toBe('16:17');
        const displayed = editor.formatLocalDateTime(instant);
        expect(displayed).toBe('2031-04-05T16:17');
        expect(+editor.parseDateValue(displayed)).toBe(+instant)
    } finally {
        editor.destroy();
        header.destroy();
        axis.destroy()
    }
});

test('one record edit is committed after validation, while cancel and invalid dates keep the record', () => {
    const
        axis  = Neo.create(TimeAxis, {timeZone: 'UTC'}),
        store = Neo.create(Events, {data: [{
            id: 'launch', title: 'Launch', startDate: '2026-11-10T12:00Z', endDate: '2026-11-10T16:00Z'
        }]}),
        record = store.get('launch'),
        editor = Neo.create(EventEditor, {appName, owner: {timeAxis: axis}}),
        writes = [];
    store.on('recordChange', ({record}) => writes.push(record.id));

    try {
        editor.openForRecord(record);
        editor.setFieldValue('title', 'Discard this edit');
        editor.onKeyDownEscape();
        expect(record.title).toBe('Launch');

        editor.openForRecord(record);
        expect(editor.getFieldValue('startDate')).toBe('2026-11-10T12:00');
        editor.setFieldValue('endDate', '2026-11-10T09:00');
        expect(editor.save()).toBe(false);
        expect(editor.hidden).toBe(false);
        expect(writes).toEqual([]);

        editor.setFieldValues({endDate: '2026-11-10T17:00', title: 'Launch review'});
        editor.save();
        expect(store.get('launch')).toBe(record);
        expect(record.title).toBe('Launch review');
        expect(record.endDate.toISOString()).toBe('2026-11-10T17:00:00.000Z');
        expect(writes).toEqual(['launch']);
    } finally {
        editor.destroy();
        store.destroy();
        axis.destroy()
    }
});

test('an owner can refuse an edit and accept the same draft on retry', () => {
    const
        store = Neo.create(Events, {data: [{
            id: 'first', title: 'Original', startDate: new Date(2026, 10, 10, 12), endDate: new Date(2026, 10, 10, 16)
        }]}),
        record = store.get('first'),
        calls = [],
        owner = {
            commitTimelineEdit(item, changes, meta) {
                calls.push({item, changes, source: meta.source});
                if (calls.length === 1) return {status: 'refused', message: 'This event is locked.'};
                item.set(changes)
            }
        },
        editor = Neo.create(EventEditor, {appName, owner});

    try {
        editor.openForRecord(record);
        editor.setFieldValue('title', 'Accepted');
        expect(editor.save()).toBe(false);
        expect(record.title).toBe('Original');
        expect(editor.hidden).toBe(false);
        expect(editor.getField('title').error).toBe('This event is locked.');
        expect(editor.save()).toEqual({title: 'Accepted'});
        expect(record.title).toBe('Accepted');
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({item: record, changes: {title: 'Accepted'}, source: 'editor'});
    } finally {
        editor.destroy();
        store.destroy()
    }
});
