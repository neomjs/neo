import {test, expect}                                  from '@playwright/test';
import fs                                               from 'fs';
import os                                               from 'os';
import path                                             from 'path';
import {cacheFilePath, readCycleState, writeCycleState} from '../../../../../ai/scripts/lifecycle/cycleStateCache.mjs';

/**
 * Self-test for the cycle-state hot-file cache — the producer↔consumer bridge between the daemon (writes
 * the verdict) and the sync liveness Stop hook (reads it without a network round-trip). Locks in the
 * fail-soft + staleness-bounded contract: a missing / malformed / stale / un-bounded cache returns null so
 * the hook fail-opens. The cache is a PURE helper: the dir + maxAge are INJECTED, never owned — so tests
 * pass their own values directly and never read or mutate the shared AiConfig singleton.
 */

const tmpFile = (name) => path.join(os.tmpdir(), `neo-cyclestate-test-${name}-${process.pid}.json`);
const verdict = {nextStep: {step: 'review-requested-pr', ref: '#1'}, claimableNowCount: 1, isEmptyCycle: false};

test.describe('cycleStateCache — cacheFilePath (path under the injected dir)', () => {
    test('joins the injected wake-daemon dir + sanitized identity (no hidden/hardcoded dir)', () => {
        const dir = path.join(os.tmpdir(), 'neo-wake-daemon-test');
        expect(cacheFilePath(dir, '@neo-opus-vega')).toBe(path.join(dir, 'cycle-state-_neo-opus-vega.json')); // @ sanitized to _
        expect(cacheFilePath(dir, null)).toBe(path.join(dir, 'cycle-state-unknown.json'))
    });
});

test.describe('cycleStateCache — write/read round-trip + fail-soft', () => {
    test('write then read preserves the verdict + reports age', () => {
        const filePath = tmpFile('roundtrip');
        try {
            expect(writeCycleState(os.tmpdir(), 'id', verdict, {now: 1000, filePath})).toBe(true);
            const got = readCycleState(os.tmpdir(), 'id', {now: 1500, maxAgeMs: 10000, filePath});
            expect(got.verdict).toEqual(verdict);
            expect(got.computedAt).toBe(1000);
            expect(got.ageMs).toBe(500)
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('missing file → null (hook fail-opens)', () => {
        expect(readCycleState(os.tmpdir(), 'id', {maxAgeMs: 10000, filePath: tmpFile('does-not-exist')})).toBeNull()
    });

    test('stale verdict (age > maxAgeMs) → null', () => {
        const filePath = tmpFile('stale');
        try {
            writeCycleState(os.tmpdir(), 'id', verdict, {now: 1000, filePath});
            // 6 min later with a 5 min bound → stale → null
            expect(readCycleState(os.tmpdir(), 'id', {now: 1000 + 6 * 60 * 1000, maxAgeMs: 5 * 60 * 1000, filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('no injected maxAgeMs → null (fail-open; the helper owns no default staleness policy)', () => {
        const filePath = tmpFile('no-maxage');
        try {
            writeCycleState(os.tmpdir(), 'id', verdict, {now: 1000, filePath});
            expect(readCycleState(os.tmpdir(), 'id', {now: 1500, filePath})).toBeNull()  // fresh file, but no injected bound → fail-open
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('malformed JSON → null (never throws)', () => {
        const filePath = tmpFile('malformed');
        try {
            fs.writeFileSync(filePath, '{ not json', 'utf8');
            expect(readCycleState(os.tmpdir(), 'id', {maxAgeMs: 10000, filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });

    test('missing computedAt / verdict fields → null', () => {
        const filePath = tmpFile('partial');
        try {
            fs.writeFileSync(filePath, JSON.stringify({verdict}), 'utf8');   // no computedAt
            expect(readCycleState(os.tmpdir(), 'id', {maxAgeMs: 10000, filePath})).toBeNull()
        } finally { fs.rmSync(filePath, {force: true}) }
    });
});
