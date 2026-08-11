/**
 * @plane host
 */
import {Command}                             from 'commander';
import {execFile}                            from 'node:child_process';
import {once}                                from 'node:events';
import {createReadStream, createWriteStream} from 'node:fs';
import {
    copyFile,
    mkdir,
    mkdtemp,
    readdir,
    rename,
    rm,
    stat,
    writeFile
} from 'node:fs/promises';
import os              from 'node:os';
import path            from 'node:path';
import readline        from 'node:readline';
import {promisify}     from 'node:util';
import {pathToFileURL} from 'node:url';
import {
    TARGET_SET_CONTROL_SCENARIOS,
    TARGET_SET_PROFILES,
    TargetSetMeasurementRecorder,
    resolveTargetSetProfile
} from './helpers/targetSetMeasurementCore.mjs';

const
    execFileAsync            = promisify(execFile),
    VECTOR_BATCH_SIZE        = 250,
    SYNTHETIC_PROVIDER_TRACE = 'synthetic-control.provider-call';

/**
 * @module ai/scripts/benchmark/restore-empty-target-meter
 * @summary Disposable 5k/20k restore target-set measurement runner.
 *
 * The runner creates a fresh bundle, staging root, and production-shaped root
 * under one OS-temporary directory, samples Node/process RSS plus disk
 * high-water marks, and writes a provenance-bearing JSON report. It supports:
 *
 * - synthetic file controls, which prove the instrument's phase/resource
 *   accounting but are permanently non-authoritative; and
 * - an injected adapter module, which lets the exact recovery-action
 *   implementation drive the same recorder without moving recovery authority
 *   into this benchmark script.
 *
 * No live Memory Core path is accepted. The root is created internally with
 * `mkdtemp()` and removed after the report is written unless `--keep-root` is
 * explicit.
 *
 * Synthetic control:
 * `node ai/scripts/benchmark/restore-empty-target-meter.mjs --profile 5k-target-set --dimension 4096 --control full`
 *
 * Exact-head candidate (after the recovery-action adapter exists):
 * `node ai/scripts/benchmark/restore-empty-target-meter.mjs --profile 5k-target-set --dimension 4096 --adapter ./path/to/exact-head-adapter.mjs`
 *
 * @see ai/scripts/benchmark/helpers/targetSetMeasurementCore.mjs
 * @see learn/agentos/decisions/0027-autonomous-data-recovery-actuator.md
 * @see https://github.com/neomjs/neo/issues/15695
 */

/**
 * Adapter contract consumed by exact-head mode. The recovery-side module exports
 * `runTargetSetMeasurementAdapter(context)` and returns
 * `{status: 'completed'|'failed'|'interrupted', detail}`. It must drive the
 * canonical progress phases itself; register the Chroma process and the
 * SQLite/shared-process accounting boundary; wrap the real embedding and
 * re-embedding entrypoints through `traceProviders` + `recordProviderCall`;
 * and report each actual vector request through `recordBatch`.
 *
 * The adapter owns invocation only. The actuator remains the mutation
 * authority, and the recorder will still label the result an
 * `exact-head-candidate` requiring public exact-head review.
 *
 * @typedef {Object} TargetSetMeasurementAdapterContext
 * @property {Object} fixture Disposable profile input and run-owned paths.
 * @property {Function} recordBatch
 * @property {Function} recordCheckpoint
 * @property {Function} recordProgress
 * @property {Function} recordProviderCall
 * @property {Function} registerProcess
 * @property {Function} registerSharedRole
 * @property {Function} sampleNow
 * @property {Function} traceProviders
 */

/**
 * @summary Writes one deterministic explicit-vector JSONL fixture without
 * retaining the profile's rows or vectors in memory.
 *
 * @param {Object} options
 * @param {'memories'|'summaries'} options.collection
 * @param {Number} options.dimension
 * @param {String} options.file
 * @param {Number} options.rows
 * @returns {Promise<{bytes: Number, rows: Number}>}
 */
export async function writeVectorFixture({collection, dimension, file, rows}) {
    if (!['memories', 'summaries'].includes(collection) || !Number.isInteger(dimension) || dimension <= 0 ||
        !Number.isInteger(rows) || rows <= 0) {
        throw new Error('writeVectorFixture requires memories|summaries plus positive integer rows and dimension')
    }

    await mkdir(path.dirname(file), {recursive: true});

    const
        embedding = `[${new Array(dimension).fill('0').join(',')}]`,
        stream    = createWriteStream(file, {encoding: 'utf8'});

    try {
        for (let index = 0; index < rows; index++) {
            const id   = `${collection}-${String(index).padStart(6, '0')}`;
            const line = `{"id":"${id}","embedding":${embedding},"metadata":{"fixture":"#15695","collection":"${collection}"},"document":"${id}"}\n`;

            if (!stream.write(line)) {
                await once(stream, 'drain')
            }
        }
    } finally {
        stream.end()
    }

    await once(stream, 'close');

    return {bytes: (await stat(file)).size, rows}
}

/**
 * @summary Writes the deterministic graph fixture in the canonical
 * `{type:'node'|'edge', data}` backup JSONL shape.
 *
 * @param {Object} options
 * @param {Number} options.edges
 * @param {String} options.file
 * @param {Number} options.nodes
 * @returns {Promise<{bytes: Number, edges: Number, nodes: Number}>}
 */
export async function writeGraphFixture({edges, file, nodes}) {
    if (!Number.isInteger(nodes) || nodes <= 0 || !Number.isInteger(edges) || edges < 0 || edges >= nodes) {
        throw new Error('writeGraphFixture requires nodes > 0 and 0 <= edges < nodes')
    }

    await mkdir(path.dirname(file), {recursive: true});

    const stream = createWriteStream(file, {encoding: 'utf8'});

    try {
        for (let index = 0; index < nodes; index++) {
            const id   = `target-set-node-${String(index).padStart(3, '0')}`;
            const line = JSON.stringify({
                type: 'node',
                data: {
                    id,
                    properties: {fixture: '#15695', ordinal: index},
                    type      : 'TARGET_SET_FIXTURE'
                }
            }) + '\n';

            if (!stream.write(line)) await once(stream, 'drain')
        }

        for (let index = 0; index < edges; index++) {
            const source = `target-set-node-${String(index).padStart(3, '0')}`;
            const target = `target-set-node-${String(index + 1).padStart(3, '0')}`;
            const line   = JSON.stringify({
                type: 'edge',
                data: {
                    id        : `${source}->${target}:TARGET_SET_SEQUENCE`,
                    properties: {fixture: '#15695', ordinal: index},
                    source,
                    target,
                    type      : 'TARGET_SET_SEQUENCE',
                    weight    : 1
                }
            }) + '\n';

            if (!stream.write(line)) await once(stream, 'drain')
        }
    } finally {
        stream.end()
    }

    await once(stream, 'close');

    return {bytes: (await stat(file)).size, edges, nodes}
}

/**
 * @summary Creates one self-contained fixture bundle plus empty staging and
 * production roots. Optional non-target bundle directories exist but remain
 * empty so the fixture cannot imply that concepts, trajectories, mailbox, or
 * Knowledge Base belong to the accepted v1 target set.
 *
 * @param {Object} options
 * @param {Number} options.dimension
 * @param {String} options.profileName
 * @param {String} options.root
 * @returns {Promise<Object>}
 */
export async function createTargetSetFixture({dimension, profileName, root}) {
    const profile = resolveTargetSetProfile(profileName);
    const bundle  = path.join(root, 'bundle');
    const paths   = {
        bundle,
        graphFile     : path.join(bundle, 'graph', 'graph-backup-target-set.jsonl'),
        memoriesFile  : path.join(bundle, 'mc', 'memory-backup-target-set.jsonl'),
        productionRoot: path.join(root, 'production'),
        stagingRoot   : path.join(root, 'staging'),
        summariesFile : path.join(bundle, 'mc', 'summaries-backup-target-set.jsonl')
    };

    await Promise.all([
        'kb',
        'mc',
        'graph',
        'concepts',
        'trajectories',
        'mailbox'
    ].map(dir => mkdir(path.join(bundle, dir), {recursive: true})));
    await Promise.all([
        mkdir(paths.productionRoot, {recursive: true}),
        mkdir(paths.stagingRoot,    {recursive: true})
    ]);

    const [memories, summaries, graph] = await Promise.all([
        writeVectorFixture({
            collection: 'memories',
            dimension,
            file      : paths.memoriesFile,
            rows      : profile.memories
        }),
        writeVectorFixture({
            collection: 'summaries',
            dimension,
            file      : paths.summariesFile,
            rows      : profile.summaries
        }),
        writeGraphFixture({
            edges: profile.graphEdges,
            file : paths.graphFile,
            nodes: profile.graphNodes
        })
    ]);

    const meta = {
        bundleVersion: 1,
        embedding    : {
            counts: {
                memories : profile.memories,
                summaries: profile.summaries
            },
            dimension,
            schemaVersion: 1
        },
        fixture: {
            fixtureClass: 'deterministic-target-set-measurement',
            issue       : 15695,
            profileName
        },
        subsystems: {
            graph: {edges: graph.edges, nodes: graph.nodes},
            mc   : {memories: profile.memories, summaries: profile.summaries}
        }
    };

    await writeFile(path.join(bundle, 'bundle-meta.json'), JSON.stringify(meta, null, 2));

    return {
        dimension,
        graph,
        memories,
        meta,
        paths,
        profile,
        summaries
    }
}

/**
 * @summary Recursively measures logical regular-file bytes below one
 * disposable root. Missing paths contribute zero so cleanup races cannot
 * invent a failure.
 *
 * @param {String} root
 * @param {Object} [fileSystem]
 * @param {Function} [fileSystem.readDirectory]
 * @param {Function} [fileSystem.readStat]
 * @returns {Promise<Number>}
 */
export async function directorySizeBytes(root, {
    readDirectory = readdir,
    readStat      = stat
} = {}) {
    let entries;

    try {
        entries = await readDirectory(root, {withFileTypes: true})
    } catch (error) {
        if (error?.code === 'ENOENT') return 0;
        throw error
    }

    let bytes = 0;

    for (const entry of entries) {
        const target = path.join(root, entry.name);

        if (entry.isDirectory()) {
            bytes += await directorySizeBytes(target, {readDirectory, readStat})
        } else if (entry.isFile()) {
            try {
                bytes += (await readStat(target)).size
            } catch (error) {
                if (error?.code !== 'ENOENT') throw error
            }
        }
    }

    return bytes
}

/**
 * @summary Samples resident bytes for a declared external process.
 *
 * @param {Number} pid
 * @returns {Promise<Number|null>}
 */
export async function samplePidRss(pid) {
    try {
        const {stdout} = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
        const rssKb    = Number(stdout.trim());

        return Number.isFinite(rssKb) ? rssKb * 1024 : null
    } catch (error) {
        return null
    }
}

/**
 * @summary Streams and validates one explicit-vector fixture.
 *
 * @param {Object} options
 * @param {Number} options.dimension
 * @param {Number} options.expectedRows
 * @param {String} options.file
 * @returns {Promise<Number>} Valid row count.
 */
export async function validateVectorFixture({dimension, expectedRows, file}) {
    const input = createReadStream(file, {encoding: 'utf8'});
    const lines = readline.createInterface({input, crlfDelay: Infinity});
    let   rows  = 0;

    try {
        for await (const line of lines) {
            if (!line.trim()) continue;

            const record = JSON.parse(line);

            if (typeof record.id !== 'string' || !Array.isArray(record.embedding) ||
                record.embedding.length !== dimension || record.embedding.some(value => !Number.isFinite(value))) {
                throw new Error(`invalid explicit-vector fixture row ${rows + 1} in ${file}`)
            }

            rows++
        }
    } finally {
        lines.close();
        input.destroy()
    }

    if (rows !== expectedRows) {
        throw new Error(`fixture row mismatch for ${file}: expected ${expectedRows}, observed ${rows}`)
    }

    return rows
}

/**
 * @summary Streams and validates the graph backup fixture.
 *
 * @param {Object} options
 * @param {Number} options.expectedEdges
 * @param {Number} options.expectedNodes
 * @param {String} options.file
 * @returns {Promise<{edges: Number, nodes: Number}>}
 */
export async function validateGraphFixture({expectedEdges, expectedNodes, file}) {
    const input = createReadStream(file, {encoding: 'utf8'});
    const lines = readline.createInterface({input, crlfDelay: Infinity});
    let   edges = 0, nodes = 0;

    try {
        for await (const line of lines) {
            if (!line.trim()) continue;

            const record = JSON.parse(line);

            if (record.type === 'node' && typeof record.data?.id === 'string') {
                nodes++
            } else if (record.type === 'edge' && record.data?.source && record.data?.target && record.data?.type) {
                edges++
            } else {
                throw new Error(`invalid graph fixture record in ${file}`)
            }
        }
    } finally {
        lines.close();
        input.destroy()
    }

    if (nodes !== expectedNodes || edges !== expectedEdges) {
        throw new Error(`graph fixture mismatch: expected ${expectedNodes}/${expectedEdges} nodes/edges, observed ${nodes}/${edges}`)
    }

    return {edges, nodes}
}

/**
 * @summary Copies a vector fixture in bounded batches and reports the observed
 * request maximum to the recorder. The synthetic control writes files, not
 * Chroma; its batch receipt proves meter plumbing only.
 *
 * @param {Object} options
 * @param {'memories'|'summaries'} options.collection
 * @param {String} options.source
 * @param {String} options.target
 * @param {TargetSetMeasurementRecorder} options.recorder
 * @returns {Promise<Number>} Copied rows.
 */
export async function copyVectorFixtureInBatches({collection, recorder, source, target}) {
    await mkdir(path.dirname(target), {recursive: true});

    const
        input  = createReadStream(source, {encoding: 'utf8'}),
        lines  = readline.createInterface({input, crlfDelay: Infinity}),
        output = createWriteStream(target, {encoding: 'utf8'});

    let batch = [], copied = 0;

    const flush = async () => {
        if (batch.length === 0) return;

        const batchSize = batch.length;

        recorder.recordBatch({collection, size: batchSize});
        const payload = batch.join('');
        batch = [];
        copied += batchSize;

        if (!output.write(payload)) await once(output, 'drain')
    };

    try {
        for await (const line of lines) {
            if (!line.trim()) continue;

            batch.push(line + '\n');
            if (batch.length === VECTOR_BATCH_SIZE) await flush()
        }

        await flush()
    } finally {
        lines.close();
        input.destroy();
        output.end()
    }

    await once(output, 'close');

    return copied
}

/**
 * @summary Runs one named phase around an async operation.
 *
 * @param {TargetSetMeasurementRecorder} recorder
 * @param {String} phase
 * @param {Function} operation
 * @returns {Promise<Object>} Phase counts.
 * @private
 */
async function runPhase(recorder, phase, operation) {
    recorder.recordProgress({phase, state: 'started'});

    const counts = await operation() ?? {};

    recorder.recordProgress({counts, phase, state: 'completed'});
    return counts
}

/**
 * @summary Validates all three files at one control root.
 *
 * @param {Object} options
 * @param {Number} options.dimension
 * @param {Object} options.files
 * @param {Object} options.profile
 * @returns {Promise<Object>}
 * @private
 */
async function validateTargetSet({dimension, files, profile}) {
    const [memories, summaries, graph] = await Promise.all([
        validateVectorFixture({dimension, expectedRows: profile.memories,  file: files.memories}),
        validateVectorFixture({dimension, expectedRows: profile.summaries, file: files.summaries}),
        validateGraphFixture({
            expectedEdges: profile.graphEdges,
            expectedNodes: profile.graphNodes,
            file         : files.graph
        })
    ]);

    return {
        graphEdges: graph.edges,
        graphNodes: graph.nodes,
        memories,
        summaries
    }
}

/**
 * @summary Executes the explicitly non-authoritative file control. It mirrors
 * the action's phase order without importing or simulating the recovery state
 * machine.
 *
 * @param {Object} options
 * @param {Object} options.fixture
 * @param {TargetSetMeasurementRecorder} options.recorder
 * @param {Function} options.sampleNow
 * @param {String} options.scenario
 * @returns {Promise<{detail: String, status: 'completed'|'interrupted'}>}
 */
export async function runSyntheticControl({fixture, recorder, sampleNow, scenario}) {
    const
        {dimension, paths, profile} = fixture,
        staged                      = {
            graph    : path.join(paths.stagingRoot, 'graph', 'graph-backup-target-set.jsonl'),
            memories : path.join(paths.stagingRoot, 'mc', 'memory-backup-target-set.jsonl'),
            summaries: path.join(paths.stagingRoot, 'mc', 'summaries-backup-target-set.jsonl')
        },
        production = {
            graph    : path.join(paths.productionRoot, 'graph', 'graph-backup-target-set.jsonl'),
            memories : path.join(paths.productionRoot, 'mc', 'memory-backup-target-set.jsonl'),
            summaries: path.join(paths.productionRoot, 'mc', 'summaries-backup-target-set.jsonl')
        };

    await runPhase(recorder, 'admission', () => validateTargetSet({
        dimension,
        files: {
            graph    : paths.graphFile,
            memories : paths.memoriesFile,
            summaries: paths.summariesFile
        },
        profile
    }));

    await runPhase(recorder, 'stage-memories', async () => ({
        memories: await copyVectorFixtureInBatches({
            collection: 'memories',
            recorder,
            source    : paths.memoriesFile,
            target    : staged.memories
        })
    }));
    await runPhase(recorder, 'stage-summaries', async () => ({
        summaries: await copyVectorFixtureInBatches({
            collection: 'summaries',
            recorder,
            source    : paths.summariesFile,
            target    : staged.summaries
        })
    }));
    await runPhase(recorder, 'stage-graph', async () => {
        await mkdir(path.dirname(staged.graph), {recursive: true});
        await copyFile(paths.graphFile, staged.graph);
        return {graphEdges: profile.graphEdges, graphNodes: profile.graphNodes}
    });
    await runPhase(recorder, 'validate-staged-target-set', () => validateTargetSet({
        dimension,
        files: staged,
        profile
    }));

    if (scenario === 'interrupt-pre-promotion') {
        await sampleNow();
        recorder.recordCheckpoint({
            detail: {afterPhase: 'validate-staged-target-set', retainedBytes: await directorySizeBytes(path.dirname(paths.bundle))},
            kind  : 'synthetic-interruption'
        });
        await runPhase(recorder, 'terminal-settlement', async () => ({
            retainedBytes: await directorySizeBytes(path.dirname(paths.bundle))
        }));

        return {
            detail: 'Synthetic interruption after staged validation; production remained untouched.',
            status: 'interrupted'
        }
    }

    await runPhase(recorder, 'promote-memories', async () => {
        await mkdir(path.dirname(production.memories), {recursive: true});
        await rename(staged.memories, production.memories);
        return {memories: profile.memories}
    });

    if (scenario === 'reconcile-after-memories') {
        await sampleNow();
        recorder.recordCheckpoint({
            detail: {afterPhase: 'promote-memories', retainedBytes: await directorySizeBytes(path.dirname(paths.bundle))},
            kind  : 'synthetic-reconciliation-boundary'
        })
    }

    await runPhase(recorder, 'promote-summaries', async () => {
        await mkdir(path.dirname(production.summaries), {recursive: true});
        await rename(staged.summaries, production.summaries);
        return {summaries: profile.summaries}
    });
    await runPhase(recorder, 'promote-graph', async () => {
        await mkdir(path.dirname(production.graph), {recursive: true});
        await rename(staged.graph, production.graph);
        return {graphEdges: profile.graphEdges, graphNodes: profile.graphNodes}
    });
    await runPhase(recorder, 'revalidate-production', () => validateTargetSet({
        dimension,
        files: production,
        profile
    }));
    await runPhase(recorder, 'terminal-settlement', async () => ({
        retainedBytes: await directorySizeBytes(path.dirname(paths.bundle))
    }));

    return {
        detail: scenario === 'reconcile-after-memories'
            ? 'Synthetic forward reconciliation resumed after memories promotion.'
            : 'Synthetic full phase control completed.',
        status: 'completed'
    }
}

/**
 * @summary Starts a non-overlapping resource sampler and exposes an immediate
 * sample hook for crash-control boundaries.
 *
 * @param {Object} options
 * @param {Number} options.intervalMs
 * @param {TargetSetMeasurementRecorder} options.recorder
 * @param {String} options.root
 * @returns {{sampleNow: Function, stop: Function}}
 * @private
 */
function startSampler({intervalMs, recorder, root}) {
    let running = true;

    const sampleNow = async () => {
        const memory    = process.memoryUsage();
        const processes = {};

        for (const [name, role] of Object.entries(recorder.resourceRoles)) {
            if (!role.separable) continue;

            const rssBytes = await samplePidRss(role.pid);
            if (rssBytes !== null) processes[name] = {rssBytes}
        }

        recorder.recordResourceSample({
            node: {
                heapUsedBytes: memory.heapUsed,
                rssBytes     : memory.rss
            },
            processes,
            tempDiskBytes: await directorySizeBytes(root)
        })
    };

    const loop = (async () => {
        while (running) {
            await sampleNow();
            if (running) await new Promise(resolve => setTimeout(resolve, intervalMs))
        }
    })();

    return {
        sampleNow,
        async stop() {
            running = false;
            await loop;
            await sampleNow()
        }
    }
}

/**
 * @summary Reads the repository head and dirtiness used to bind candidate
 * evidence. Exact-head adapter mode refuses a dirty worktree.
 *
 * @returns {Promise<{dirty: Boolean, head: String|null}>}
 * @private
 */
async function readGitIdentity() {
    try {
        const [{stdout: head}, {stdout: statusOutput}] = await Promise.all([
            execFileAsync('git', ['rev-parse', 'HEAD']),
            execFileAsync('git', ['status', '--porcelain'])
        ]);

        return {dirty: statusOutput.trim().length > 0, head: head.trim()}
    } catch (error) {
        return {dirty: true, head: null}
    }
}

/**
 * @summary Runs the CLI.
 *
 * @returns {Promise<void>}
 * @private
 */
async function main() {
    const program = new Command()
        .requiredOption('--profile <name>', `fixture profile (${Object.keys(TARGET_SET_PROFILES).join(' | ')})`)
        .requiredOption('--dimension <number>', 'explicit vector dimension')
        .option('--control <scenario>', `synthetic control (${TARGET_SET_CONTROL_SCENARIOS.join(' | ')})`)
        .option('--adapter <module>', 'exact-head adapter module exporting runTargetSetMeasurementAdapter(context)')
        .option('--sample-interval <ms>', 'resource sampling interval', '25')
        .option('--out <file>', 'JSON report path (defaults to the OS temp directory)')
        .option('--keep-root', 'retain the disposable bundle/staging/production root after the run', false)
        .parse(process.argv);

    const options    = program.opts();
    const dimension  = Number(options.dimension);
    const intervalMs = Number(options.sampleInterval);

    resolveTargetSetProfile(options.profile);

    if (!Number.isInteger(dimension) || dimension <= 0) {
        throw new Error(`--dimension must be a positive integer, got "${options.dimension}"`)
    }
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
        throw new Error(`--sample-interval must be a positive integer, got "${options.sampleInterval}"`)
    }
    if (Boolean(options.control) === Boolean(options.adapter)) {
        throw new Error('choose exactly one of --control or --adapter')
    }
    if (options.control && !TARGET_SET_CONTROL_SCENARIOS.includes(options.control)) {
        throw new Error(`unknown control "${options.control}"`)
    }

    const
        gitIdentity = await readGitIdentity(),
        root        = await mkdtemp(path.join(os.tmpdir(), 'neo-target-set-meter-')),
        reportFile  = path.resolve(options.out ?? path.join(
            os.tmpdir(),
            `neo-target-set-report-${options.profile}-${Date.now()}.json`
        )),
        evidenceClass = options.control ? 'synthetic-control' : 'exact-head-candidate';

    if (evidenceClass === 'exact-head-candidate' && (gitIdentity.dirty || !gitIdentity.head)) {
        await rm(root, {force: true, recursive: true});
        throw new Error('exact-head adapter mode requires a clean git worktree with a resolvable HEAD')
    }

    const recorder = new TargetSetMeasurementRecorder({
        evidenceClass,
        implementationHead: evidenceClass === 'exact-head-candidate' ? gitIdentity.head : null,
        profileName       : options.profile,
        repositoryHead    : gitIdentity.head,
        scenario          : options.control ?? null
    });

    recorder.recordCheckpoint({
        detail: {dirty: gitIdentity.dirty, head: gitIdentity.head},
        kind  : 'repository-identity'
    });
    recorder.recordCheckpoint({
        detail: {
            sampleIntervalMs   : intervalMs,
            tempDiskMeasurement: 'logical regular-file bytes (sum of stat.size) below the disposable root'
        },
        kind: 'measurement-contract'
    });

    if (options.control) {
        recorder.declareProviderTrace({
            coverage   : 'synthetic adapter seam only; no production provider entrypoint is imported',
            entrypoints: [SYNTHETIC_PROVIDER_TRACE]
        });
        recorder.declareResourceRole({
            name     : 'chroma',
            reason   : 'synthetic file control starts no Chroma process',
            separable: false
        });
        recorder.declareResourceRole({
            name     : 'sqlite',
            reason   : 'synthetic file control starts no SQLite process',
            separable: false
        })
    }

    const sampler = startSampler({intervalMs, recorder, root});
    let   report, samplerStopped = false;

    try {
        const fixture = await createTargetSetFixture({
            dimension,
            profileName: options.profile,
            root
        });

        recorder.recordFixture({
            graphEdges              : fixture.graph.edges,
            graphNodes              : fixture.graph.nodes,
            graphSerializedBytes    : fixture.graph.bytes,
            memories                : fixture.memories.rows,
            memoriesSerializedBytes : fixture.memories.bytes,
            summaries               : fixture.summaries.rows,
            summariesSerializedBytes: fixture.summaries.bytes,
            vectorDimension         : dimension
        });

        let outcome;

        if (options.control) {
            outcome = await runSyntheticControl({
                fixture,
                recorder,
                sampleNow: sampler.sampleNow,
                scenario : options.control
            })
        } else {
            const adapterUrl = pathToFileURL(path.resolve(options.adapter)).href;
            const adapter    = await import(adapterUrl);

            if (typeof adapter.runTargetSetMeasurementAdapter !== 'function') {
                throw new Error(`${options.adapter} must export async runTargetSetMeasurementAdapter(context)`)
            }

            outcome = await adapter.runTargetSetMeasurementAdapter({
                fixture,
                recordBatch       : receipt => recorder.recordBatch(receipt),
                recordCheckpoint  : receipt => recorder.recordCheckpoint(receipt),
                recordProgress    : receipt => recorder.recordProgress(receipt),
                recordProviderCall: receipt => recorder.recordProviderCall(receipt),
                registerProcess   : receipt => recorder.declareResourceRole({...receipt, separable: true}),
                registerSharedRole: receipt => recorder.declareResourceRole({...receipt, separable: false}),
                sampleNow         : sampler.sampleNow,
                traceProviders    : receipt => recorder.declareProviderTrace(receipt)
            })
        }

        await sampler.stop();
        samplerStopped = true;
        report = recorder.finish(outcome)
    } finally {
        if (!samplerStopped) {
            await sampler.stop();
            samplerStopped = true
        }

        await mkdir(path.dirname(reportFile), {recursive: true});

        if (report) {
            await writeFile(reportFile, JSON.stringify(report, null, 2))
        }

        const reportInsideRoot = reportFile === root || reportFile.startsWith(root + path.sep);

        if (!options.keepRoot && !reportInsideRoot) {
            await rm(root, {force: true, recursive: true})
        }
    }

    console.log(`[restore-empty-target-meter] report: ${reportFile}`);
    console.log(`[restore-empty-target-meter] evidence=${report.evidenceClass} status=${report.status} authoritative=${report.authority.authoritative}`);
    console.log(`[restore-empty-target-meter] ${report.authority.reason}`);

    if (options.keepRoot) {
        console.log(`[restore-empty-target-meter] disposable root retained by request: ${root}`)
    }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
    main().catch(error => {
        console.error(`[restore-empty-target-meter] ${error.stack ?? error.message}`);
        process.exit(1)
    })
}
