import {setup} from '../../../../../setup.mjs';

const appName = 'KBSchemasTest';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}    from '@playwright/test';
import Ajv2020           from 'ajv/dist/2020.js';
import fs                from 'fs-extra';
import path              from 'path';
import {fileURLToPath}   from 'url';
import Neo               from '../../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const schemaDir = path.resolve(__dirname, '../../../../../../../ai/services/knowledge-base/parser');

const ajv = new Ajv2020({allErrors: true, strict: false});

const parsedChunkSchema  = await fs.readJson(path.join(schemaDir, 'parsed-chunk-v1.schema.json'));
const backupRecordSchema = await fs.readJson(path.join(schemaDir, 'backup-record-v1.schema.json'));

const validateParsedChunk  = ajv.compile(parsedChunkSchema);
const validateBackupRecord = ajv.compile(backupRecordSchema);

// Canonical happy-path parsed-chunk-v1 record used as a seed in many tests. Mirrors Neo's
// own curated content shape post-Phase-0/1B path-identity-tuple migration: tenantId is the
// reserved 'neo-shared' team-namespace constant, repoSlug is 'neo', rootKind is
// 'neo-workspace'.
const validParsedChunk = () => ({
    schemaVersion: '1.0.0',
    tenantId     : 'neo-shared',
    repoSlug     : 'neo',
    rootKind     : 'neo-workspace',
    sourcePath   : 'src/component/Button.mjs',
    content      : 'class Button extends Component { static config = {...} }',
    hashInputs   : ['type', 'name', 'content', 'className'],
    parserId     : 'acorn-source-parser',
    parserVersion: '1.0.0',
    kind         : 'method',
    name         : 'src/component/Button.mjs - render()',
    line_start   : 42,
    line_end     : 58,
    className    : 'Neo.component.Button',
    extends      : 'Neo.component.Base'
});

const validBackupRecord = () => ({
    id       : 'sha256-abc123-chunk-hash',
    embedding: [0.1, 0.2, -0.3, 0.4],
    metadata : {kind: 'method', tenantId: 'neo-shared', repoSlug: 'neo'},
    document : 'class Button extends Component { render() {} }'
});

test.describe('parsed-chunk-v1 schema (Phase 0/1A #11629)', () => {
    test('accepts a fully-populated valid record', () => {
        const record = validParsedChunk();
        expect(validateParsedChunk(record)).toBe(true);
        expect(validateParsedChunk.errors).toBeNull();
    });

    test('accepts a minimal valid record (only required fields)', () => {
        const record = {
            schemaVersion: '1.0.0',
            tenantId     : 'client-tenant',
            repoSlug     : 'client-org/main-app',
            rootKind     : 'bare-repo',
            sourcePath   : 'src/index.js',
            content      : 'console.log(1)',
            hashInputs   : ['content'],
            parserId     : 'es5-parser',
            parserVersion: '0.1.0',
            kind         : 'module-context',
            name         : 'index.js - [Module]'
        };
        expect(validateParsedChunk(record)).toBe(true);
    });

    test('REJECTS records carrying an embedding field (spoof-rejection invariant — Phase 0/1C contract boundary)', () => {
        // The embedding field is reserved for backup-record-v1 restore path; parsed-chunk-v1
        // records ALWAYS trigger server-side embedding via VectorService.embed. Records that
        // pre-supply an embedding are routed away from this contract by the Phase 2 ingestion
        // service. This test asserts the schema-layer rejection that backs that runtime
        // boundary.
        const record = {...validParsedChunk(), embedding: [0.1, 0.2]};
        expect(validateParsedChunk(record)).toBe(false);
        expect(validateParsedChunk.errors).not.toBeNull();
        expect(validateParsedChunk.errors.some(e => e.params?.additionalProperty === 'embedding')).toBe(true);
    });

    test('rejects records missing required fields', () => {
        const incomplete = {schemaVersion: '1.0.0', tenantId: 'x'};
        expect(validateParsedChunk(incomplete)).toBe(false);
        expect(validateParsedChunk.errors).not.toBeNull();
    });

    test('rejects records with mismatched schemaVersion', () => {
        const record = {...validParsedChunk(), schemaVersion: '0.9.0'};
        expect(validateParsedChunk(record)).toBe(false);
        // Field-level error attribution: schemaVersion must be const '1.0.0'
        expect(validateParsedChunk.errors.some(e => e.instancePath === '/schemaVersion')).toBe(true);
    });

    test('rejects invalid rootKind values (closed enum)', () => {
        const record = {...validParsedChunk(), rootKind: 'totally-made-up'};
        expect(validateParsedChunk(record)).toBe(false);
        expect(validateParsedChunk.errors.some(e => e.instancePath === '/rootKind')).toBe(true);
    });

    test('rejects tenantId with uppercase characters (lowercase-kebab AgentIdentity convention)', () => {
        const record = {...validParsedChunk(), tenantId: 'INVALID-Upper'};
        expect(validateParsedChunk(record)).toBe(false);
        expect(validateParsedChunk.errors.some(e => e.instancePath === '/tenantId')).toBe(true);
    });

    test('rejects empty hashInputs array (deterministic chunkId requires at least one input field)', () => {
        const record = {...validParsedChunk(), hashInputs: []};
        expect(validateParsedChunk(record)).toBe(false);
        expect(validateParsedChunk.errors.some(e => e.instancePath === '/hashInputs')).toBe(true);
    });

    test('rejects unknown top-level fields (additionalProperties: false)', () => {
        const record = {...validParsedChunk(), unknownField: 'should-not-survive'};
        expect(validateParsedChunk(record)).toBe(false);
        expect(validateParsedChunk.errors.some(e => e.params?.additionalProperty === 'unknownField')).toBe(true);
    });

    test('accepts open-enum kind values (parser-protocol extensibility)', () => {
        // kind is intentionally an open enum — custom parsers may emit values beyond Neo's
        // own 'module-context' / 'class-properties' / 'class-config' / 'method' / etc.
        // This test guards against accidental future-self introduction of a closed enum.
        const record = {...validParsedChunk(), kind: 'protobuf-message'};
        expect(validateParsedChunk(record)).toBe(true);
    });

    test('round-trips through JSON.stringify + JSON.parse without losing validity', () => {
        const record = validParsedChunk();
        const roundTripped = JSON.parse(JSON.stringify(record));
        expect(validateParsedChunk(roundTripped)).toBe(true);
    });
});

test.describe('backup-record-v1 schema (Phase 0/1A #11629)', () => {
    test('accepts a valid record with embedding', () => {
        const record = validBackupRecord();
        expect(validateBackupRecord(record)).toBe(true);
        expect(validateBackupRecord.errors).toBeNull();
    });

    test('REJECTS records missing embedding field (matches DatabaseService.importDatabase runtime constraint)', () => {
        // GPT Cycle 1 PR review V-B-A: DatabaseService.importDatabase always passes
        // `embeddings: batch.map(r => r.embedding)` into collection.upsert(). A missing
        // embedding field lands as undefined in the embeddings array; Chroma only
        // re-embeds when the ENTIRE recordSet.embeddings property is absent, not when
        // individual slots are undefined. The schema enforces what the current restore
        // path actually supports.
        const {embedding: _drop, ...record} = validBackupRecord();
        expect(validateBackupRecord(record)).toBe(false);
        expect(validateBackupRecord.errors.some(e => e.params?.missingProperty === 'embedding')).toBe(true);
    });

    test('rejects records missing required id field', () => {
        const {id: _drop, ...record} = validBackupRecord();
        expect(validateBackupRecord(record)).toBe(false);
    });

    test('rejects records missing required metadata field', () => {
        const {metadata: _drop, ...record} = validBackupRecord();
        expect(validateBackupRecord(record)).toBe(false);
    });

    test('rejects records missing required document field', () => {
        const {document: _drop, ...record} = validBackupRecord();
        expect(validateBackupRecord(record)).toBe(false);
    });

    test('rejects unknown top-level fields (additionalProperties: false)', () => {
        const record = {...validBackupRecord(), unknownField: 'forbidden'};
        expect(validateBackupRecord(record)).toBe(false);
        expect(validateBackupRecord.errors.some(e => e.params?.additionalProperty === 'unknownField')).toBe(true);
    });

    test('round-trips through JSON.stringify + JSON.parse without losing validity', () => {
        const record = validBackupRecord();
        const roundTripped = JSON.parse(JSON.stringify(record));
        expect(validateBackupRecord(roundTripped)).toBe(true);
    });
});

test.describe('schema contract separation (Phase 0/1A #11629)', () => {
    test('a valid parsed-chunk-v1 record is NOT a valid backup-record-v1 record (distinct shapes)', () => {
        const parsed = validParsedChunk();
        expect(validateParsedChunk(parsed)).toBe(true);
        expect(validateBackupRecord(parsed)).toBe(false);
    });

    test('a valid backup-record-v1 record is NOT a valid parsed-chunk-v1 record (distinct shapes)', () => {
        const backup = validBackupRecord();
        expect(validateBackupRecord(backup)).toBe(true);
        expect(validateParsedChunk(backup)).toBe(false);
    });
});
