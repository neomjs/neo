import {setup} from '../../../../../../setup.mjs';

const appName = 'ResolvedConfigReporterTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'node:os';
import path           from 'node:path';
import Neo            from '../../../../../../../../src/Neo.mjs';

/**
 * Reporter coverage for the self-report side of the resolved-config channel.
 *
 * The published FILE is the artifact under test, not the return value: the file is what crosses the
 * process boundary, so a secret absent from the return value and present on disk would still be a
 * leak. Every assertion here reads the file back.
 *
 * Isolation is a temporary directory passed through the `dir` seam. The shared config singleton is
 * never mutated to isolate a test — that is the mechanism that bleeds test data into live stores.
 */
test.describe.configure({mode: 'serial'});

test.describe('ResolvedConfigReporterService — the self-report side (#17356)', () => {
    let reporter, tmpDir;

    const SECRET = 'glpat-SECRET-must-never-appear',
          config = () => ({
              embedding: {batchSize: 1, batchDelay: 10000, apiKey: SECRET},
              transport: 'http'
          }),
          allowlist = () => [
              {path: 'embedding.batchSize',  kind: 'number'},
              {path: 'embedding.batchDelay', kind: 'number'},
              {path: 'transport',            kind: 'enum', values: ['http', 'stdio']}
          ];

    test.beforeAll(async () => {
        reporter = (await import('../../../../../../../../ai/mcp/server/shared/services/ResolvedConfigReporterService.mjs')).default;
        tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'resolved-config-report-'));
    });

    test.afterAll(() => {
        tmpDir && fs.removeSync(tmpDir);
    });

    test('publishes the allowlisted subset, and the SECRET is absent from the file on disk', () => {
        const published = reporter.start({
            serviceKey   : 'kb-server',
            dir          : tmpDir,
            readConfig   : config,
            readAllowlist: allowlist
        });

        expect(published).toBe(true);

        const filePath = reporter.reportPath('kb-server', tmpDir),
              // Read the RAW text, not the parsed object: a secret could ride in a key, a value, or an
              // omission reason, and the file is what crosses the boundary.
              raw      = fs.readFileSync(filePath, 'utf8'),
              record   = JSON.parse(raw);

        expect(raw, 'the published file must not contain the credential in any position').not.toContain('glpat-');

        expect(record.recordType).toBe('deployment-resolved-config');
        expect(record.provenance).toBe('self-reported');
        expect(record.serviceKey).toBe('kb-server');

        // Not vacuous: the allowlisted values really are published.
        expect(record.disclosed['embedding.batchSize']).toEqual({value: 1, kind: 'number'});
        expect(record.disclosed['transport']).toEqual({value: 'http', kind: 'enum'});
        expect(Object.keys(record.disclosed)).toHaveLength(3);
        expect(Object.keys(record.disclosed)).not.toContain('embedding.apiKey');
    });

    test('the filename is distinct from the heap observation sharing that directory', () => {
        // Both self-reports live in one directory. A shared `${serviceKey}.json` would make each reader
        // guess which record type it opened.
        expect(reporter.reportPath('kb-server', tmpDir)).toBe(path.resolve(tmpDir, 'kb-server.resolved-config.json'));
        expect(reporter.reportPath('kb-server', tmpDir)).not.toBe(path.resolve(tmpDir, 'kb-server.json'));
    });

    test('a config getter that THROWS degrades the channel and never the caller', () => {
        // The caller is a booting service. `readConfig` is a thunk precisely so this read happens
        // inside the guard: as a default parameter it would be evaluated outside the try and take the
        // boot down with it.
        const logged = [];

        let published;

        expect(() => {
            published = reporter.start({
                serviceKey   : 'throwing-service',
                dir          : tmpDir,
                writeLog     : (level, message) => logged.push({level, message}),
                readConfig   : () => { throw new Error('config getter exploded') },
                readAllowlist: allowlist
            })
        }, 'a failing config read must not propagate to a booting service').not.toThrow();

        expect(published).toBe(false);
        expect(logged.some(entry => entry.level === 'WARN')).toBe(true);
        expect(fs.existsSync(reporter.reportPath('throwing-service', tmpDir))).toBe(false);
    });

    test('a malformed allowlist degrades with a reason rather than publishing anything', () => {
        // A wildcard entry is refused by the validator; the reporter absorbs the refusal so the
        // service still boots, and publishes NOTHING rather than falling back to a wider set.
        const logged = [];

        const published = reporter.start({
            serviceKey   : 'wildcard-service',
            dir          : tmpDir,
            writeLog     : (level, message) => logged.push({level, message}),
            readConfig   : config,
            readAllowlist: () => [{path: 'embedding.*', kind: 'number'}]
        });

        expect(published).toBe(false);
        expect(logged.some(entry => entry.level === 'WARN')).toBe(true);

        // The arm that matters: a refused allowlist must not degrade OPEN.
        expect(fs.existsSync(reporter.reportPath('wildcard-service', tmpDir))).toBe(false);
    });

    test('a not-yet-existing directory is created rather than failing the report', () => {
        // The atomic writer resolves the parent chain with `mkdir(recursive)`, so a self-report
        // directory that does not exist yet on a fresh volume is a normal first-boot state and not an
        // error. Asserted rather than assumed: I expected a failure here and the write succeeds, which
        // is the better behaviour — a reporter that needed its directory pre-created would go silent
        // on exactly the deployment that has never reported before.
        const nested    = path.join(tmpDir, 'fresh', 'volume'),
              logged    = [],
              published = reporter.start({
                  serviceKey   : 'kb-server',
                  dir          : nested,
                  writeLog     : (level, message) => logged.push({level, message}),
                  readConfig   : config,
                  readAllowlist: allowlist
              });

        expect(published).toBe(true);
        expect(fs.existsSync(reporter.reportPath('kb-server', nested))).toBe(true);
        expect(logged.some(entry => entry.level === 'WARN')).toBe(false);

        // The boundary still holds on the created path.
        expect(fs.readFileSync(reporter.reportPath('kb-server', nested), 'utf8')).not.toContain('glpat-');
    });

    test('omissions are published beside disclosures, with reasons', () => {
        reporter.start({
            serviceKey   : 'partial-service',
            dir          : tmpDir,
            readConfig   : () => ({embedding: {batchSize: 7}}),
            readAllowlist: allowlist
        });

        const record = fs.readJsonSync(reporter.reportPath('partial-service', tmpDir));

        expect(record.disclosed['embedding.batchSize']).toEqual({value: 7, kind: 'number'});

        const reasons = record.omitted.map(entry => `${entry.path}:${entry.reason}`);

        expect(reasons).toContain('embedding.batchDelay:path-absent');
        expect(reasons).toContain('transport:path-absent');

        // Absence carries a reason and never a value — a reader must not be able to read a default.
        expect(record.omitted.every(entry => !('value' in entry))).toBe(true);
    });
});
