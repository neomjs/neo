import {test, expect} from '@playwright/test';
import {
    defectNoteFingerprint,
    foldDefectObservations,
    parseDefectNote
} from '../../../../../../../ai/services/memory-core/helpers/defectObservationFold.mjs';

// Pure module — no Neo runtime, no fs, no clock (the fold takes `now` as a parameter).

const NOTE = 'defect-note: query_summaries broke returns zero-content rows for populated sessions';

test.describe('defectObservationFold — the defect-channel read model', () => {
    test('the fingerprint is deterministic from the note alone, prefix- and marker-insensitive', () => {
        const base = defectNoteFingerprint(NOTE);

        expect(defectNoteFingerprint(NOTE)).toBe(base);
        // The prefix and a recovery marker carry no identity.
        expect(defectNoteFingerprint(NOTE.replace('defect-note:', ''))).toBe(base);
        expect(defectNoteFingerprint(NOTE.replace('defect-note:', 'defect-note: [recovered]'))).toBe(base);
        expect(base).toMatch(/^[0-9a-f]{16}$/);
    });

    test('normalization merges casing, whitespace, and volatile tokens — never distinct defects', () => {
        const a = defectNoteFingerprint('defect-note: KB Ingestion broke  404 on repo 12345'),
              b = defectNoteFingerprint('defect-note: kb ingestion broke 404 on repo 678');

        expect(a).toBe(b); // volatile digit runs collapse

        const c = defectNoteFingerprint('defect-note: KB Ingestion broke 500 on repo 12345');

        expect(c).not.toBe(a); // a different symptom is a different observation
    });

    test('parseDefectNote: the " broke " split is the structure; unparseable notes stay foldable', () => {
        expect(parseDefectNote(NOTE)).toEqual({
            parseable: true,
            recovered: false,
            surface  : 'query_summaries',
            symptom  : 'returns zero-content rows for populated sessions'
        });
        expect(parseDefectNote('defect-note: [recovered] kb broke embed stall').recovered).toBe(true);

        const malformed = parseDefectNote('defect-note: something vague happened');

        expect(malformed.parseable).toBe(false);
        expect(malformed.surface).toBe('something vague happened');
    });

    test('the fold aggregates one record per fingerprint with count, reporters, and sighting bounds', () => {
        const records = foldDefectObservations([
            {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: NOTE},
            {from: '@b', sentAt: '2026-08-15T09:00:00Z', subject: NOTE},
            {from: '@a', sentAt: '2026-08-15T08:30:00Z', subject: 'defect-note: kbSync broke wedge on one slow file'}
        ], {now: Date.parse('2026-08-15T10:00:00Z')});

        expect(records).toHaveLength(2);

        const top = records[0]; // most-recently-active first

        expect(top.fingerprint).toBe(defectNoteFingerprint(NOTE));
        expect(top).toMatchObject({
            count      : 2,
            reporters  : ['@a', '@b'],
            firstSeenAt: '2026-08-15T08:00:00.000Z',
            lastSeenAt : '2026-08-15T09:00:00.000Z',
            state      : 'red'
        });
    });

    test('recovery is idempotent and a fresh sighting re-opens — newest transition wins', () => {
        const recovered = NOTE.replace('defect-note:', 'defect-note: [recovered]'),
              records   = foldDefectObservations([
                  {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: NOTE},
                  {from: '@b', sentAt: '2026-08-15T09:00:00Z', subject: recovered},
                  // A duplicate recovery note changes nothing — the fold recomputes state.
                  {from: '@b', sentAt: '2026-08-15T09:01:00Z', subject: recovered}
              ], {now: Date.parse('2026-08-15T10:00:00Z')});

        expect(records).toHaveLength(1);
        expect(records[0].state).toBe('recovered');
        expect(records[0].count).toBe(3);

        const reopened = foldDefectObservations([
            {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: recovered},
            {from: '@a', sentAt: '2026-08-15T09:00:00Z', subject: NOTE}
        ], {now: Date.parse('2026-08-15T10:00:00Z')});

        expect(reopened[0].state).toBe('red');
    });

    test('aging is a fold parameter: a stale record reads quiet, and quiet never mutates the trail', () => {
        const rows    = [{from: '@a', sentAt: '2026-08-01T08:00:00Z', subject: NOTE}],
              records = foldDefectObservations(rows, {now: Date.parse('2026-08-15T10:00:00Z'), quietAfterMs: 7 * 24 * 60 * 60 * 1000});

        expect(records[0].state).toBe('quiet');
        // The record keeps its last transition under the aging overlay.
        expect(records[0].count).toBe(1);

        const fresh = foldDefectObservations(rows, {now: Date.parse('2026-08-01T09:00:00Z')});

        expect(fresh[0].state).toBe('red');
    });

    test('the fold guards its coordinates and skips unaddressable rows', () => {
        expect(() => foldDefectObservations([], {now: Number.NaN})).toThrow(/now and a positive finite quietAfterMs/);
        expect(() => foldDefectObservations([], {quietAfterMs: 0})).toThrow(/now and a positive finite quietAfterMs/);

        const records = foldDefectObservations([
            {from: '@a', sentAt: 'not-a-date', subject: NOTE},
            {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: '   '},
            {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: NOTE}
        ], {now: Date.parse('2026-08-15T10:00:00Z')});

        expect(records).toHaveLength(1);
        expect(records[0].count).toBe(1);
    });

    test('the fold reads the subject deliberately — a body never re-identifies a note', () => {
        // Production callers filter on `subject.startsWith('defect-note:')` and the list
        // projection carries no body at all, so identity comes from the subject by construction.
        const records = foldDefectObservations([
            {from: '@a', sentAt: '2026-08-15T08:00:00Z', subject: NOTE, body: 'defect-note: unrelated text entirely'},
            {from: '@b', sentAt: '2026-08-15T09:00:00Z', subject: NOTE}
        ], {now: Date.parse('2026-08-15T10:00:00Z')});

        expect(records).toHaveLength(1);
        expect(records[0].fingerprint).toBe(defectNoteFingerprint(NOTE));
        expect(records[0].count).toBe(2);
    });
});
