import {test, expect}                                  from '@playwright/test';
import fs                                               from 'fs';
import os                                               from 'os';
import path                                             from 'path';
import {cacheFilePath, readCycleState, writeCycleState} from '../../../../../ai/scripts/lifecycle/cycleStateCache.mjs';

/**
 * Self-test for the cycle-state hot-file cache — the producer↔consumer bridge between the daemon (writes
 * the verdict) and the sync liveness Stop hook (reads it without a network round-trip). Lock in the
 * fail-soft + staleness-bounded contract: a missing / malformed / stale cache returns null so the hook
 * fail-opens. Uses the `filePath` seam → an os.tmpdir() file, so tests never touch the runtime dir.
 */

const tmpFile = (name) => path.join(os.tmpdir(), `neo-cyclestate-test-${name}-${process.pid}.json`);
const verdict = {nextStep: {step: 'review-requested-pr', ref: '#1'}, claimableNowCount: 1, isEmptyCycle: false};

test.describe('cycleStateCache — cacheFilePath', () => {
    test('sanitizes the identity into the wake-daemon runtime dir', () => {
        const p = cacheFilePath('@neo-opus-vega');
        expect(p).toContain('.neo-ai-data/wake-daemon/');
        expect(p).toContain('cycle-state-_neo-opus-vega.json');   // @ sanitized to _
        expect(cacheFilePath(null)).toContain('cycle-state-unknown.json')
    });
});

test.describe('cycleStateCache — write/read round-trip + fail-soft', () => {
    test('write then read preserves the verdict + reports age', () => {
        const filePath = tmpFile('roundtrip');
        try {
            expect(writeCycleState('id', verdict, {now: 1000, filePath})).toBe(true);
            const got = readCycleState('id', {now: 1500, maxAgeMs: 10000, filePath});
            expect(got.verdict).toEqual(verdict);
            expect(got.computedAt).toBe(1000);
            expect(got.ageMs).toBe(500)
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('missing file → null (hook fail-opens)', () => {
        expect(readCycleState('id', {filePath: tmpFile('does-not-exist')})).toBeNull()
    });

    test('stale verdict (age > maxAgeMs) → null', () => {
        const filePath = tmpFile('stale');
        try {
            writeCycleState('id', verdict, {now: 1000, filePath});
            // 6 min later with a 5 min bound → stale → null
            expect(readCycleState('id', {now: 1000 + 6 * 60 * 1000, maxAgeMs: 5 * 60 * 1000, filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('malformed JSON → null (never throws)', () => {
        const filePath = tmpFile('malformed');
        try {
            fs.writeFileSync(filePath, '{ not json', 'utf8');
            expect(readCycleState('id', {filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('missing computedAt / verdict fields → null', () => {
        const filePath = tmpFile('partial');
        try {
            fs.writeFileSync(filePath, JSON.stringify({verdict}), 'utf8');   // no computedAt
            expect(readCycleState('id', {filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });
});
