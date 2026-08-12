import {test, expect} from '@playwright/test';
import {createHash}   from 'node:crypto';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    PROVIDER_LANE_CUTOVER_MANIFEST_SCHEMA_VERSION,
    PROVIDER_LANE_CUTOVER_RECEIPT_SLOTS,
    buildProviderLaneCutoverManifest,
    parseArgs,
    validateProviderLaneCutoverManifest
} from '../../../../../../ai/scripts/diagnostics/providerLaneCutoverManifest.mjs';

const REVISION       = 'a'.repeat(40);
const ELECTION_HEAD  = 'b'.repeat(40);
const OUTSIDE_COMMIT = 'e'.repeat(40);
const PR_MERGE       = 'd'.repeat(40);

const DEPLOYMENT_INPUTS = Object.freeze({
    chatCpuCores : {env: 'NEO_PROVIDER_LANE_CHAT_CPUS', value: '2'},
    totalCpuCores: {env: 'NEO_PROVIDER_LANES_CPU_TOTAL', value: '4'}
});

function createReport() {
    return {
        repositoryHead  : ELECTION_HEAD,
        deploymentInputs: structuredClone(DEPLOYMENT_INPUTS),
        selectedReceipt : {
            deploymentInputs: structuredClone(DEPLOYMENT_INPUTS),
            lanes           : {
                chat     : {dnsName: 'chat-model', image: 'img@sha256:1', model: 'gemma@sha256:2'},
                embedding: {dnsName: 'embedding-model', image: 'img@sha256:3', model: 'embed@sha256:4'}
            },
            envelope: {allocations: {}, scope: 'provider-runtimes', total: {cpuCores: 4, memoryBytes: 8}},
            roles   : {embedding: 'embedding', graph: 'chat', kbAskSynthesis: 'chat', model: 'chat'}
        },
        selectedReceiptDigest: `sha256:${'c'.repeat(64)}`
    }
}

function committedHealth() {
    return {
        status : 'committed',
        epoch  : 3,
        elected: {generationId: 'gen-2', embeddingGenerationId: 'embed-2', declaredAt: 't2', coordinates: {provider: 'llamaCpp'}},
        parked : {generationId: 'gen-1', embeddingGenerationId: 'embed-1', declaredAt: 't1', coordinates: {provider: 'ollama'}}
    }
}

function sha256(value) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function createFixture({health = committedHealth(), report = createReport(), slots} = {}) {
    const dir        = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-manifest-'));
    const reportPath = path.join(dir, 'election-report.json');
    const ancestry   = new Set([ELECTION_HEAD, PR_MERGE]);

    fs.writeFileSync(reportPath, JSON.stringify(report));

    const receiptSlots = {};

    for (const [name, content] of Object.entries(slots ?? {})) {
        const slotPath = path.join(dir, `${name}.json`);

        fs.writeFileSync(slotPath, content);
        receiptSlots[name] = slotPath
    }

    return {
        cut: {
            revision            : REVISION,
            requiredPullRequests: [{number: 17020, mergeCommit: PR_MERGE}],
            electionReportPath  : reportPath,
            vectorGenerationDir : path.join(dir, 'vector-generation'),
            receiptSlots
        },
        seams: {
            gitIsAncestor         : ancestor => ancestry.has(ancestor),
            readFileBytes         : filePath => fs.readFileSync(filePath),
            projectHealth         : async () => health,
            validateElectionReport: value => structuredClone(value)
        },
        dir,
        reportPath
    }
}

const ALL_SLOT_CONTENT = Object.freeze({
    containment: '{"verdict":"PASS"}',
    rebuild    : '{"resumed":true}',
    promotion  : '{"promoted":5}',
    rollback   : '{"restored":5}'
});

test.describe('providerLaneCutoverManifest (#17026)', () => {
    test('a complete cut copies every coordinate from its validated sources', async () => {
        const {cut, seams, reportPath} = createFixture({slots: ALL_SLOT_CONTENT});
        const manifest                 = await buildProviderLaneCutoverManifest({cut, ...seams});

        expect(manifest.schemaVersion).toBe(PROVIDER_LANE_CUTOVER_MANIFEST_SCHEMA_VERSION);
        expect(manifest.status).toBe('complete');
        expect(manifest.missing).toEqual([]);
        expect(manifest.neoRevision).toBe(REVISION);
        expect(manifest.electionRepositoryHead).toBe(ELECTION_HEAD);

        // Copy-not-derive: the manifest's profile fields are byte-equal to the report's.
        const report = createReport();

        expect(manifest.deploymentInputs).toEqual(report.deploymentInputs);
        expect(manifest.lanes).toEqual(report.selectedReceipt.lanes);
        expect(manifest.envelope).toEqual(report.selectedReceipt.envelope);
        expect(manifest.roles).toEqual(report.selectedReceipt.roles);
        expect(manifest.selectedReceiptDigest).toBe(report.selectedReceiptDigest);

        expect(manifest.vectorGeneration).toEqual({
            bound   : true,
            status  : 'committed',
            epoch   : 3,
            current : committedHealth().elected,
            rollback: committedHealth().parked
        });

        expect(manifest.receiptSlots.composition).toEqual({
            sha256: report.selectedReceiptDigest,
            source: 'election-report:selectedReceipt'
        });
        expect(manifest.receiptSlots.resourceElection.sha256).toBe(sha256(fs.readFileSync(reportPath)));
        expect(manifest.receiptSlots.containment.sha256).toBe(sha256(ALL_SLOT_CONTENT.containment));

        validateProviderLaneCutoverManifest(manifest)
    });

    test('regenerating from the same cut reproduces the manifest byte-for-byte', async () => {
        const {cut, seams} = createFixture({slots: ALL_SLOT_CONTENT});
        const first        = await buildProviderLaneCutoverManifest({cut, ...seams});
        const second       = await buildProviderLaneCutoverManifest({cut, ...seams});

        expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    });

    test('a revision that does not contain a required PR refuses by number', async () => {
        const {cut, seams} = createFixture();

        cut.requiredPullRequests = [{number: 17028, mergeCommit: OUTSIDE_COMMIT}];

        await expect(buildProviderLaneCutoverManifest({cut, ...seams}))
            .rejects.toThrow(/does not contain PR #17028/)
    });

    test('election evidence measured outside the pinned revision refuses', async () => {
        const report = createReport();

        report.repositoryHead = OUTSIDE_COMMIT;

        const {cut, seams} = createFixture({report});

        await expect(buildProviderLaneCutoverManifest({cut, ...seams}))
            .rejects.toThrow(/measured at e{40}/)
    });

    test('an elected outcome disagreeing with its selected receipt refuses as a mixed profile', async () => {
        const report = createReport();

        report.selectedReceipt.deploymentInputs.chatCpuCores.value = '4';

        const {cut, seams} = createFixture({report});

        await expect(buildProviderLaneCutoverManifest({cut, ...seams}))
            .rejects.toThrow(/mixed profile/)
    });

    test('the election validator refusal propagates before any packaging', async () => {
        const {cut, seams} = createFixture();

        seams.validateElectionReport = () => {
            throw new Error('provider-lane downstream proof requires an elected report')
        };

        await expect(buildProviderLaneCutoverManifest({cut, ...seams}))
            .rejects.toThrow(/requires an elected report/)
    });

    test('an uncommitted generation pair marks the manifest incomplete, never bound', async () => {
        const {cut, seams} = createFixture({health: {status: 'accepted'}, slots: ALL_SLOT_CONTENT});
        const manifest     = await buildProviderLaneCutoverManifest({cut, ...seams});

        expect(manifest.status).toBe('incomplete');
        expect(manifest.missing).toEqual(['vector-generation-committed-pair']);
        expect(manifest.vectorGeneration).toEqual({bound: false, status: 'accepted'});

        expect(() => validateProviderLaneCutoverManifest(manifest)).toThrow(/handoff refused/);
        validateProviderLaneCutoverManifest(manifest, {requireComplete: false})
    });

    test('missing evidence files stay null slots and name themselves', async () => {
        const {cut, seams} = createFixture({slots: {containment: ALL_SLOT_CONTENT.containment}});
        const manifest     = await buildProviderLaneCutoverManifest({cut, ...seams});

        expect(manifest.status).toBe('incomplete');
        expect(manifest.missing).toEqual(['rebuild', 'promotion', 'rollback']);
        expect(manifest.receiptSlots.containment).not.toBeNull();
        expect(manifest.receiptSlots.rebuild).toBeNull()
    });

    test('cut declarations refuse unknown keys, foreign slots, and malformed PR entries', async () => {
        const base = () => createFixture({slots: ALL_SLOT_CONTENT});

        {
            const {cut, seams} = base();

            cut.surprise = true;
            await expect(buildProviderLaneCutoverManifest({cut, ...seams})).rejects.toThrow(/cut declaration must carry exactly/)
        }
        {
            const {cut, seams} = base();

            cut.receiptSlots.bogus = '/tmp/x';
            await expect(buildProviderLaneCutoverManifest({cut, ...seams})).rejects.toThrow(/receipt slots/)
        }
        {
            const {cut, seams} = base();

            cut.requiredPullRequests = [{number: 0, mergeCommit: PR_MERGE}];
            await expect(buildProviderLaneCutoverManifest({cut, ...seams})).rejects.toThrow(/malformed/)
        }
        {
            const {cut, seams} = base();

            cut.revision = 'dev';
            await expect(buildProviderLaneCutoverManifest({cut, ...seams})).rejects.toThrow(/full 40-hex commit/)
        }
    });

    test('the manifest validator refuses tampered shapes', async () => {
        const {cut, seams} = createFixture({slots: ALL_SLOT_CONTENT});
        const manifest     = await buildProviderLaneCutoverManifest({cut, ...seams});

        {
            const tampered = structuredClone(manifest);

            tampered.extra = 1;
            expect(() => validateProviderLaneCutoverManifest(tampered)).toThrow(/must carry exactly/)
        }
        {
            const tampered = structuredClone(manifest);

            tampered.receiptSlots.rebuild = null;
            expect(() => validateProviderLaneCutoverManifest(tampered)).toThrow(/empty but not declared missing/)
        }
        {
            const tampered = structuredClone(manifest);

            tampered.missing = ['rebuild'];
            expect(() => validateProviderLaneCutoverManifest(tampered)).toThrow(/status disagrees/)
        }
        {
            const tampered = structuredClone(manifest);

            tampered.receiptSlots.containment = {path: 'x', sha256: 'sha256:short'};
            expect(() => validateProviderLaneCutoverManifest(tampered)).toThrow(/checksum-bound/)
        }
        {
            const tampered = structuredClone(manifest);

            tampered.vectorGeneration = {bound: false, status: 'accepted'};
            expect(() => validateProviderLaneCutoverManifest(tampered)).toThrow(/does not declare it missing/)
        }

        expect(PROVIDER_LANE_CUTOVER_RECEIPT_SLOTS).toHaveLength(6)
    });

    test('the CLI surface requires --cut and rejects unknown arguments', () => {
        expect(() => parseArgs([])).toThrow(/--cut/);
        expect(() => parseArgs(['--cut'])).toThrow(/requires a file path/);
        expect(() => parseArgs(['--cut', 'a.json', '--nope'])).toThrow(/Unknown argument/);
        expect(parseArgs(['--cut', 'a.json', '--out', 'b.json'])).toEqual({cutPath: 'a.json', outPath: 'b.json'})
    })
});
