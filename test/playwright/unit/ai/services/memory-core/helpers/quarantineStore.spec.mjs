import {test, expect}           from '@playwright/test';
import {mkdtemp, rm, writeFile} from 'fs/promises';
import {tmpdir}                 from 'os';
import path                     from 'path';
import {
    getQuarantineFilePath,
    isCollectionQuarantined,
    quarantineCollection,
    readQuarantinedCollections,
    unquarantineCollection
} from '../../../../../../../ai/services/memory-core/helpers/quarantineStore.mjs';

let dir;

test.beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'neo-quarantine-'));
});

test.afterEach(async () => {
    await rm(dir, {recursive: true, force: true});
});

test.describe('quarantineStore — the per-collection serving fence', () => {
    test('a fresh store fences nothing', async () => {
        expect(await isCollectionQuarantined('c1', {dir})).toBe(false);
        expect(await readQuarantinedCollections({dir})).toEqual({});
    });

    test('quarantineCollection fences exactly the named collection', async () => {
        await quarantineCollection('c1', {dir, reason: 'unrecoverable-vector-loss', now: 1000});

        expect(await isCollectionQuarantined('c1', {dir})).toBe(true);
        expect(await isCollectionQuarantined('c2', {dir})).toBe(false);
        expect(await readQuarantinedCollections({dir})).toEqual({
            c1: {quarantinedAt: 1000, reason: 'unrecoverable-vector-loss'}
        });
    });

    test('unquarantineCollection lifts the fence (reversible) and reports whether it was fenced', async () => {
        await quarantineCollection('c1', {dir, now: 1});

        expect(await unquarantineCollection('c1', {dir})).toBe(true);
        expect(await isCollectionQuarantined('c1', {dir})).toBe(false);
        expect(await unquarantineCollection('c1', {dir})).toBe(false); // already lifted → no-op
    });

    test('a CORRUPT fence file fails SAFE to not-fenced — a bad fence must never become a read outage', async () => {
        await writeFile(getQuarantineFilePath(dir), '{ not valid json', 'utf8');

        expect(await isCollectionQuarantined('c1', {dir})).toBe(false);
        expect(await readQuarantinedCollections({dir})).toEqual({});
    });

    test('blank input / a missing dir never throws (the guard must be safe on the hot read path)', async () => {
        expect(await isCollectionQuarantined('c1', {dir: path.join(dir, 'nope')})).toBe(false);
        expect(await isCollectionQuarantined('',   {dir})).toBe(false);
        expect(await isCollectionQuarantined('c1', {dir: ''})).toBe(false);
    });
});
