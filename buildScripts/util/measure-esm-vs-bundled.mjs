#!/usr/bin/env node
/**
 * @module buildScripts/util/measure-esm-vs-bundled
 * @summary Reproducible HTTP/2 and HTTP/3 measurement harness comparing `dist/esm`, `dist/production`,
 * and an `esbuild --splitting` probe for Portal and a generated starter app under Linux `netem` link shaping.
 *
 * Designed for ephemeral Linux CI runners: raises `net.core.rmem_max`/`wmem_max` for QUIC bursts, creates
 * a temporary `ip netns` + `veth` namespace shaped with `tc netem` (`0 ms`, `50 ms`, `150 ms`, `50 ms + 1% loss`),
 * temporarily stages `dist/esbuild-probe` inside the workspace (cleaned in `finally`), serves Portal and a
 * scaffolded starter app via Caddy over HTTP/2 and HTTP/3, stamps initial frame, post-frame interaction, and
 * lazy-extension readiness on the in-page `requestAnimationFrame` `performance.now()` clock, and verifies
 * `nextHopProtocol` (`h2` or `h3`) plus App Worker static import waterfall depth.
 */
import {chromium}                       from '@playwright/test';
import * as acorn                       from 'acorn';
import * as esbuild                     from 'esbuild';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import fs                               from 'node:fs';
import os                               from 'node:os';
import path                             from 'node:path';
import process                          from 'node:process';
import {fileURLToPath}                  from 'node:url';
import {staticModuleSpecifiers}         from './esmDistTransforms.mjs';
import isEntryModule                    from './isEntryModule.mjs';

const
    __filename   = fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    ROOT         = path.resolve(__dirname, '../..'),
    NETNS_NAME   = 'ns_neobench',
    HOST_VETH    = 'veth_host',
    SRV_VETH     = 'veth_srv',
    HOST_IP      = '10.200.1.1',
    SRV_IP       = '10.200.1.2',
    HOST_DOMAIN  = 'neo-bench.internal',
    PORTAL_PORT  = 8443,
    STARTER_PORT = 8444;

export const LINK_ARMS = Object.freeze([
    {id: '0ms',         label: '0 ms (clean)',     oneWayDelayMs: 0,  oneWayLossPct: 0},
    {id: '50ms',        label: '50 ms RTT',        oneWayDelayMs: 25, oneWayLossPct: 0},
    {id: '150ms',       label: '150 ms RTT',       oneWayDelayMs: 75, oneWayLossPct: 0},
    {id: '50ms+1%loss', label: '50 ms + 1% loss',  oneWayDelayMs: 25, oneWayLossPct: 0.5}
]);

const PORTAL_LAZY_ENTRIES = Object.freeze([
    'apps/portal/app.mjs',
    'apps/portal/view/home/MainContainer.mjs',
    'apps/portal/view/learn/MainContainer.mjs',
    'apps/portal/view/news/TabContainer.mjs',
    'apps/portal/view/services/Container.mjs',
    'apps/portal/view/examples/MainContainer.mjs',
    'apps/portal/view/about/Container.mjs',
    'docs/app/view/MainContainer.mjs'
]);

/**
 * @summary Computes the reachable static ESM module graph and longest-shortest-path hop depth from an entry file.
 * @param {String} entryFile Absolute path to the root `.mjs` file.
 * @param {String} [baseDir=path.dirname(entryFile)] Directory used to format relative chain labels.
 * @returns {{reachableCount: Number, maxStaticDepth: Number, deepestChain: String[]}}
 */
export function computeImportWaterfallDepth(entryFile, baseDir = path.dirname(entryFile)) {
    const
        resolvedEntry = path.resolve(entryFile),
        visited       = new Set([resolvedEntry]),
        queue         = [{file: resolvedEntry, depth: 0, chain: [path.relative(baseDir, resolvedEntry)]}];

    let maxStaticDepth = 0,
        deepestChain   = [path.relative(baseDir, resolvedEntry)],
        index          = 0;

    while (index < queue.length) {
        const current = queue[index++];

        if (!fs.existsSync(current.file)) {
            continue
        }

        const specifiers = staticModuleSpecifiers(fs.readFileSync(current.file, 'utf8'));

        for (const specifier of specifiers) {
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
                continue
            }

            const target = path.resolve(path.dirname(current.file), specifier);

            if (visited.has(target) || !fs.existsSync(target)) {
                continue
            }

            visited.add(target);

            const
                nextDepth = current.depth + 1,
                nextChain = [...current.chain, path.relative(baseDir, target)];

            if (nextDepth > maxStaticDepth) {
                maxStaticDepth = nextDepth;
                deepestChain   = nextChain
            }

            queue.push({file: target, depth: nextDepth, chain: nextChain})
        }
    }

    return {reachableCount: visited.size, maxStaticDepth, deepestChain}
}

/**
 * @summary Computes numeric median and min-max range for a non-empty array of numbers.
 * @param {Number[]} values Measured samples.
 * @param {Number} [decimals=1] Rounding precision.
 * @returns {{median: Number, min: Number, max: Number, spread: String}}
 */
function statsFor(values, decimals = 1) {
    if (!values.length) {
        return {median: 0, min: 0, max: 0, spread: 'n/a'}
    }

    const
        sorted = [...values].sort((a, b) => a - b),
        factor = 10 ** decimals,
        round  = n => Math.round(n * factor) / factor,
        mid    = Math.floor(sorted.length / 2),
        median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
        min    = round(sorted[0]),
        max    = round(sorted[sorted.length - 1]);

    return {
        median: round(median),
        min,
        max,
        spread: min === max ? `${min}` : `${min}–${max}`
    }
}

/**
 * @summary Aggregates five measured browser runs into medians, spreads, and strict protocol verification.
 * @param {Object[]} runs Array of per-run metric objects.
 * @param {String} expectedProtocol Expected HTTP protocol (`'h2'` or `'h3'`).
 * @param {Boolean} [requireNetworkProtocol=true] When true (cold runs), requires at least one network transfer matching `expectedProtocol`.
 * @returns {Object} Aggregated summary with protocol counts and verification flag.
 */
export function summarizeFiveRuns(runs, expectedProtocol, requireNetworkProtocol = true) {
    const
        protocols     = {},
        badProtocols  = [],
        frameMs       = statsFor(runs.map(r => r.frameMs)),
        requests      = statsFor(runs.map(r => r.requests), 0),
        transferKB    = statsFor(runs.map(r => r.transferBytes / 1024)),
        waterfallMs   = statsFor(runs.map(r => r.workerWaterfallMs)),
        interactionMs = statsFor(runs.map(r => r.interactionMs)),
        lazyMs        = statsFor(runs.map(r => r.lazyExtensionMs));

    let totalNetworkReqs = 0;

    for (const run of runs) {
        for (const [proto, count] of Object.entries(run.protocolCounts || {})) {
            protocols[proto] = (protocols[proto] || 0) + count;

            if (proto !== 'cached' && proto !== '') {
                totalNetworkReqs += count;

                if (proto !== expectedProtocol && !badProtocols.includes(proto)) {
                    badProtocols.push(proto)
                }
            }
        }
    }

    const
        hasExpected      = (protocols[expectedProtocol] || 0) > 0,
        verifiedProtocol = badProtocols.length === 0 && (!requireNetworkProtocol || (totalNetworkReqs > 0 && hasExpected));

    return {
        runCount: runs.length,
        frameMs,
        requests,
        transferKB,
        waterfallMs,
        interactionMs,
        lazyMs,
        protocols,
        badProtocols,
        verifiedProtocol
    }
}

/**
 * @summary Replaces `importApp` dynamic template literal inside a copied `src/worker/App.mjs` with explicit entry imports.
 * @param {String} source Module text of `src/worker/App.mjs`.
 * @param {String[]} entries Workspace-relative `.mjs` entry paths admitted for bundling.
 * @returns {String} Patched source module text.
 */
export function patchImportAppManifest(source, entries) {
    let targetImport = null;

    const visit = node => {
        if (!node || typeof node !== 'object' || targetImport) {
            return
        }

        if (Array.isArray(node)) {
            node.forEach(visit);
            return
        }

        if (
            node.type === 'ImportExpression' &&
            node.source?.type === 'TemplateLiteral' &&
            node.source.expressions.length === 1 &&
            node.source.quasis[0]?.value?.cooked === '../../' &&
            node.source.quasis[1]?.value?.cooked === '.mjs'
        ) {
            targetImport = node;
            return
        }

        Object.keys(node).forEach(key => key !== 'parent' && visit(node[key]))
    };

    visit(acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'}));

    if (!targetImport) {
        throw new Error('Could not locate computed `import(\\`../../${path}.mjs\\`)` inside App worker for esbuild probe')
    }

    const
        expr     = targetImport.source.expressions[0],
        argText  = source.slice(expr.start, expr.end),
        branches = entries.map(entry => {
            const key = entry.replace(/\.mjs$/, '');
            return `v===${JSON.stringify(key)}?import(${JSON.stringify('../../' + entry)})`
        }),
        bodyExpr    = [...branches, 'Promise.reject(new Error("Unadmitted app: "+v))'].join(':'),
        replacement = `((v=>${bodyExpr})(${argText}))`;

    return source.slice(0, targetImport.start) + replacement + source.slice(targetImport.end)
}

/**
 * @summary Probes `esbuild --splitting` first on raw source (recording why manifest-free bundling fails) and
 * then on a copy of `dist/esm` with a hand-written entry manifest.
 * @param {Object} options Probe options.
 * @param {String} options.workspaceRoot Workspace containing source and `dist/esm`.
 * @param {Boolean} options.insideNeo Whether the workspace is the engine repository itself.
 * @param {String[]} options.entries Hand-written `.mjs` entries relative to `dist/esm`.
 * @param {String} [options.rawAppEntry='apps/portal/app.mjs'] Workspace-relative app entry for the raw source probe.
 * @returns {Promise<Object>} Probe result covering both raw failure mode and split build output.
 */
export async function buildEsbuildSplittingProbe({workspaceRoot, insideNeo, entries, rawAppEntry = 'apps/portal/app.mjs'}) {
    const
        esmDir    = path.join(workspaceRoot, 'dist/esm'),
        probeDir  = path.join(workspaceRoot, 'dist/esbuild-probe'),
        rawWorker = path.join(workspaceRoot, insideNeo ? 'src/worker/App.mjs' : 'node_modules/neo.mjs/src/worker/App.mjs'),
        rawApp    = path.join(workspaceRoot, rawAppEntry);

    let rawSrcResult;

    try {
        await esbuild.build({
            entryPoints: [rawWorker, rawApp],
            bundle     : true,
            splitting  : true,
            format     : 'esm',
            outdir     : path.join(os.tmpdir(), `neo-esbuild-raw-${process.pid}`),
            write      : false,
            logLevel   : 'silent'
        });
        rawSrcResult = {ok: true, summary: 'Raw esbuild built without manifest plugin'}
    } catch (err) {
        const computedLine = fs.readFileSync(rawWorker, 'utf8').split('\n').findIndex(line => line.includes('../../${')) + 1;

        rawSrcResult = {
            ok    : false,
            reason: `Raw \`src/worker/App.mjs\` line ${computedLine} (\`import(\\\`../../\${path}.mjs\\\`)\`) has no admission plugin, so esbuild globs across non-browser workspace files outside the module graph`
        }
    }

    fs.rmSync(probeDir, {recursive: true, force: true});
    fs.cpSync(esmDir, probeDir, {recursive: true});

    const entryMap = {'src/worker/App': path.join(probeDir, 'src/worker/App.mjs')};

    for (const rel of entries) {
        entryMap[rel.replace(/\.mjs$/, '')] = path.join(probeDir, rel)
    }

    const appManifestPlugin = {
        name: 'neo-esbuild-probe-manifest',
        setup(build) {
            build.onLoad({filter: /[/\\]src[/\\]worker[/\\]App\.mjs$/}, args => ({
                contents: patchImportAppManifest(fs.readFileSync(args.path, 'utf8'), entries),
                loader  : 'js'
            }))
        }
    };

    try {
        await esbuild.build({
            entryPoints   : entryMap,
            bundle        : true,
            splitting     : true,
            format        : 'esm',
            minify        : true,
            outdir        : probeDir,
            outbase       : probeDir,
            chunkNames    : 'chunks/[name]-[hash]',
            outExtension  : {'.js': '.mjs'},
            allowOverwrite: true,
            plugins       : [appManifestPlugin],
            logLevel      : 'silent'
        });

        const
            chunksDir  = path.join(probeDir, 'chunks'),
            chunkFiles = fs.existsSync(chunksDir) ? fs.readdirSync(chunksDir) : [];

        return {
            ok        : true,
            probeDir,
            rawSrc    : rawSrcResult,
            chunkCount: chunkFiles.length,
            entryCount: Object.keys(entryMap).length
        }
    } catch (err) {
        return {
            ok    : false,
            rawSrc: rawSrcResult,
            error : err.message
        }
    }
}

/**
 * @summary Renders the reproducible Markdown report covering metadata, both apps' tables, waterfall depth, and esbuild diagnostics.
 * @param {Object} report Full measurement payload.
 * @returns {String} Markdown document.
 */
export function formatMeasurementMarkdown(report) {
    const lines = [
        '# Measurement Report: `dist/esm` vs `dist/production` vs `esbuild --splitting` (#21216)',
        '',
        `- **Commit:** \`${report.meta.commit}\``,
        `- **Machine:** ${report.meta.machine}`,
        `- **Browser:** ${report.meta.browser}`,
        `- **Server:** ${report.meta.server}`,
        `- **Command:** \`${report.meta.command}\``,
        `- **Runs per cell:** ${report.meta.runs} cold + ${report.meta.runs} warm`,
        '',
        '## App Worker Import Waterfall Depth (Static Graph)',
        '',
        '| Entry | Reachable modules | Max hop depth | Deepest static chain |',
        '|---|---|---|---|'
    ];

    for (const wf of report.waterfalls) {
        lines.push(`| ${wf.label} | ${wf.reachableCount} | ${wf.maxStaticDepth} | \`${wf.deepestChain.slice(0, 4).join(' → ')} → … → ${wf.deepestChain.at(-1)}\` |`)
    }

    lines.push('', '## `esbuild --splitting` Probe (Row 4d′)', '');

    for (const [appKey, probe] of Object.entries(report.esbuildProbes)) {
        lines.push(`- **${appKey} (raw \`src/worker/App.mjs\`):** ${probe.rawSrc?.ok ? probe.rawSrc.summary : probe.rawSrc?.reason}`);

        if (probe.ok) {
            if (probe.runtimeError) {
                lines.push(`- **${appKey} (hand-written entry manifest on \`dist/esbuild-probe\`):** built (${probe.entryCount} entries → ${probe.chunkCount} shared split chunks), FAILED at worker boot — \`${probe.runtimeError}\``)
            } else {
                lines.push(`- **${appKey} (hand-written entry manifest on \`dist/esbuild-probe\`):** built cleanly (${probe.entryCount} entries → ${probe.chunkCount} shared split chunks)`)
            }
        } else {
            lines.push(`- **${appKey} (hand-written entry manifest):** FAILED — \`${probe.error}\``)
        }
    }

    for (const app of report.apps) {
        lines.push(
            '',
            `## ${app.title}`,
            '',
            '| Build | Proto | Link | Cache | Frame ms (spread) | Res entries (med) | KB (med) | Worker waterfall ms | Interaction ms | Lazy ext ms | `nextHopProtocol` | Class/Singleton check |',
            '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|'
        );

        for (const cell of app.cells) {
            if (cell.error) {
                lines.push(`| ${cell.build} | ${cell.protocol} | ${cell.link} | ${cell.cache} | ERROR | - | - | - | - | - | ${cell.error} | failed |`);
                continue
            }

            const
                s        = cell.summary,
                protoStr = Object.entries(s.protocols).map(([k, v]) => `${k || 'cached'}:${v}`).join(', ');

            lines.push(
                `| ${cell.build} | ${cell.protocol} | ${cell.link} | ${cell.cache} ` +
                `| ${s.frameMs.median} (${s.frameMs.spread}) ` +
                `| ${s.requests.median} (${s.requests.spread}) ` +
                `| ${s.transferKB.median} ` +
                `| ${s.waterfallMs.median} (${s.waterfallMs.spread}) ` +
                `| ${s.interactionMs.median} ` +
                `| ${s.lazyMs.median} ` +
                `| ${s.verifiedProtocol ? 'PASS' : 'FAIL'} (${protoStr}) ` +
                `| ${cell.runtimeCheck || 'n/a'} |`
            )
        }
    }

    return lines.join('\n') + '\n'
}

/**
 * @summary Runs a command synchronously and throws a contextual error on non-zero status.
 * @param {String} cmd Executable name.
 * @param {String[]} args CLI arguments.
 * @param {Object} [opts={}] Extra spawnSync options.
 * @returns {String} Trimmed stdout text.
 */
function runOrThrow(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, {encoding: 'utf8', stdio: 'pipe', ...opts});

    if (res.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed (${res.status}):\n${res.stdout}\n${res.stderr}`)
    }

    return (res.stdout || '').trim()
}

/**
 * @summary Generates an ECDSA P-256 self-signed TLS certificate and returns its Chromium SPKI SHA-256 Base64 digest.
 * @param {String} certDir Directory where `cert.pem` and `key.pem` are created.
 * @returns {{certPath: String, keyPath: String, spkiBase64: String}}
 */
function createSelfSignedCert(certDir) {
    fs.mkdirSync(certDir, {recursive: true});

    const
        certPath = path.join(certDir, 'cert.pem'),
        keyPath  = path.join(certDir, 'key.pem'),
        extCfg   = path.join(certDir, 'openssl.cnf');

    fs.writeFileSync(extCfg, `[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
[dn]
CN = ${HOST_DOMAIN}
[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:${HOST_DOMAIN},IP:${SRV_IP}`);

    runOrThrow('openssl', [
        'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
        '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '7', '-config', extCfg
    ]);

    const
        pubKeyDer  = execFileSync('openssl', ['pkey', '-in', keyPath, '-pubout', '-outform', 'der']),
        spkiBase64 = execFileSync('openssl', ['dgst', '-sha256', '-binary'], {input: pubKeyDer}).toString('base64').trim();

    return {certPath, keyPath, spkiBase64}
}

/**
 * @summary Applies or clears symmetric `tc netem` latency and packet loss across both `veth` endpoints.
 * @param {Object} arm Entry from {@link LINK_ARMS}.
 * @returns {void}
 */
function applyNetemArm(arm) {
    if (arm.oneWayDelayMs === 0 && arm.oneWayLossPct === 0) {
        spawnSync('sudo', ['tc', 'qdisc', 'del', 'dev', HOST_VETH, 'root'], {stdio: 'ignore'});
        spawnSync('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'tc', 'qdisc', 'del', 'dev', SRV_VETH, 'root'], {stdio: 'ignore'});
        return
    }

    const args = ['delay', `${arm.oneWayDelayMs}ms`, 'limit', '10000'];

    if (arm.oneWayLossPct > 0) {
        args.push('loss', `${arm.oneWayLossPct}%`)
    }

    runOrThrow('sudo', ['tc', 'qdisc', 'replace', 'dev', HOST_VETH, 'root', 'netem', ...args]);
    runOrThrow('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'tc', 'qdisc', 'replace', 'dev', SRV_VETH, 'root', 'netem', ...args])
}

/**
 * @summary Starts Caddy inside the isolated network namespace and waits until its TLS listener responds.
 * @param {Object} options Server options.
 * @param {String} options.certPath TLS certificate path.
 * @param {String} options.keyPath TLS private key path.
 * @param {String} options.neoRoot Root directory for Portal.
 * @param {String} options.starterRoot Root directory for Starter app.
 * @param {String} options.protocol `'h2'` or `'h3'`.
 * @param {String} options.workDir Temp working directory for Caddyfile.
 * @returns {Promise<{stop: Function}>} Server handle.
 */
async function startCaddyInNetns({certPath, keyPath, neoRoot, starterRoot, protocol, workDir}) {
    const
        caddyfile = path.join(workDir, `Caddyfile.${protocol}`),
        protoList = protocol === 'h3' ? 'h3 h2 h1' : 'h2 h1',
        siteBlock = (port, root) =>
            `https://${HOST_DOMAIN}:${port} {\n    tls ${certPath} ${keyPath}\n    root * ${root}\n    file_server\n}`;

    fs.writeFileSync(caddyfile, [
        `{\n    admin off\n    auto_https disable_redirects\n    servers {\n        protocols ${protoList}\n    }\n}`,
        siteBlock(PORTAL_PORT, neoRoot),
        siteBlock(STARTER_PORT, starterRoot)
    ].join('\n'));

    const child = spawn('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'caddy', 'run', '--config', caddyfile, '--adapter', 'caddyfile'], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';

    child.stderr.on('data', chunk => {
        stderr += chunk.toString()
    });

    for (let i = 0; i < 40; i++) {
        const probe = spawnSync('curl', ['-sk', '--resolve', `${HOST_DOMAIN}:${PORTAL_PORT}:${SRV_IP}`, `https://${HOST_DOMAIN}:${PORTAL_PORT}/`], {stdio: 'ignore'});

        if (probe.status === 0) {
            break
        }

        if (child.exitCode !== null) {
            throw new Error(`Caddy (${protocol}) exited early (${child.exitCode}): ${stderr}`)
        }

        await new Promise(resolve => setTimeout(resolve, 150))
    }

    return {
        stop: async () => {
            if (child.exitCode !== null) {
                return
            }

            const exited = new Promise(resolve => child.once('exit', resolve));

            try {
                runOrThrow('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'pkill', '-TERM', 'caddy'])
            } catch {
                child.kill('SIGTERM')
            }

            const killTimer = setTimeout(() => {
                spawnSync('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'pkill', '-KILL', 'caddy'], {stdio: 'ignore'})
            }, 2000);

            await exited;
            clearTimeout(killTimer)
        }
    }
}

/**
 * @summary Builds Chrome launch arguments enforcing exact HTTP/2 or forced HTTP/3 over SPKI-pinned self-signed TLS.
 * @param {String} protocol `'h2'` or `'h3'`.
 * @param {String} spkiBase64 Base64 SHA-256 SubjectPublicKeyInfo digest.
 * @returns {String[]} Chromium CLI flags.
 */
function chromiumArgsFor(protocol, spkiBase64) {
    const args = [
        `--host-resolver-rules=MAP ${HOST_DOMAIN} ${SRV_IP}`,
        `--ignore-certificate-errors-spki-list=${spkiBase64}`,
        '--no-sandbox'
    ];

    if (protocol === 'h3') {
        args.push(
            '--enable-quic',
            '--quic-version=h3',
            `--origin-to-force-quic-on=${HOST_DOMAIN}:${PORTAL_PORT},${HOST_DOMAIN}:${STARTER_PORT}`
        )
    } else {
        args.push('--disable-quic')
    }

    return args
}

/**
 * @summary Evaluates an expression inside a worker CDP target using non-flattened target messaging.
 * @param {Object} browserCdp Browser-level CDP session.
 * @param {String} targetId Target identifier from `Target.getTargets`.
 * @param {String} expression JavaScript expression returning a serializable value.
 * @returns {Promise<*>} Evaluated return value, or `null` on detachment or timeout.
 */
async function evaluateWorkerTarget(browserCdp, targetId, expression) {
    let sessionId = null;

    try {
        ({sessionId} = await browserCdp.send('Target.attachToTarget', {targetId, flatten: false}));

        return await new Promise(resolve => {
            const finish = value => {
                clearTimeout(timer);
                browserCdp.off('Target.receivedMessageFromTarget', onMessage);
                resolve(value)
            };

            const onMessage = ev => {
                if (ev.sessionId !== sessionId) {
                    return
                }

                try {
                    const msg = JSON.parse(ev.message);

                    if (msg.id === 1) {
                        finish(msg.result?.result?.value ?? null)
                    }
                } catch {
                    finish(null)
                }
            };

            const timer = setTimeout(() => finish(null), 3000);

            browserCdp.on('Target.receivedMessageFromTarget', onMessage);
            browserCdp.send('Target.sendMessageToTarget', {
                sessionId,
                message: JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}})
            }).catch(() => finish(null))
        })
    } catch {
        return null
    } finally {
        if (sessionId) {
            await browserCdp.send('Target.detachFromTarget', {sessionId}).catch(() => {})
        }
    }
}

/**
 * @summary Collects same-origin Page and Worker resource timing entries and optional runtime singleton checks via CDP.
 * @param {Object} page Playwright Page.
 * @param {String} origin Origin URL prefix for same-origin filtering.
 * @param {Object} browserCdp Browser-level CDP session.
 * @param {String|null} lazyClassName Optional lazy class name to verify in App Worker after navigation.
 * @returns {Promise<Object>} Metrics `{requests, transferBytes, protocolCounts, workerWaterfallMs, runtimeCheck}`.
 */
async function collectCdpMetrics(page, origin, browserCdp, lazyClassName) {
    const pageEntries = await page.evaluate(orig =>
        performance.getEntriesByType('resource')
            .filter(e => e.name.startsWith(orig))
            .map(e => ({
                name           : e.name,
                nextHopProtocol: e.nextHopProtocol || '',
                transferSize   : e.transferSize || 0,
                startTime      : e.startTime,
                responseEnd    : e.responseEnd
            })),
    origin);

    const
        allEntries    = [...pageEntries],
        seenUrls      = new Set(),
        workerWindows = [];
    let runtimeCheck = 'uninspected';

    const expr = `(function() {
        const entries = performance.getEntriesByType('resource').map(e => ({
            name: e.name, nextHopProtocol: e.nextHopProtocol || '',
            transferSize: e.transferSize || 0, startTime: e.startTime, responseEnd: e.responseEnd
        }));
        performance.clearResourceTimings?.();
        let check = null;
        if (typeof Neo !== 'undefined' && Neo.worker?.App) {
            const lazyCls = ${JSON.stringify(lazyClassName)};
            const hasApp = Neo.worker.App === Neo.ns('Neo.worker.App');
            const hasInst = Neo.manager?.Instance === Neo.ns('Neo.manager.Instance');
            const hasLazy = !lazyCls || Boolean(Neo.ns(lazyCls, false));
            check = 'appSingleton=' + hasApp + ',instSingleton=' + hasInst + ',lazyClass=' + hasLazy;
        }
        return {href: self.location?.href || '', entries, check};
    })()`;

    const {targetInfos = []} = await browserCdp.send('Target.getTargets');

    for (const targetInfo of targetInfos) {
        if (!['worker', 'shared_worker', 'service_worker'].includes(targetInfo.type) || !(targetInfo.url || '').startsWith(origin)) {
            continue
        }

        const val = await evaluateWorkerTarget(browserCdp, targetInfo.targetId, expr);

        if (!val) {
            continue
        }

        if (val.check) {
            runtimeCheck = val.check
        }

        const sameOrigin = val.entries.filter(e => e.name.startsWith(origin));

        for (const item of sameOrigin) {
            if (!seenUrls.has(`${targetInfo.targetId}:${item.name}:${item.startTime}`)) {
                seenUrls.add(`${targetInfo.targetId}:${item.name}:${item.startTime}`);
                allEntries.push(item)
            }
        }

        if (val.href.includes('App.mjs') || val.href.includes('appworker')) {
            const jsEntries = sameOrigin.filter(e => e.name.endsWith('.mjs') || e.name.endsWith('.js'));

            if (jsEntries.length) {
                const
                    minStart = Math.min(...jsEntries.map(e => e.startTime)),
                    maxEnd   = Math.max(...jsEntries.map(e => e.responseEnd));

                workerWindows.push(maxEnd - minStart)
            }
        }
    }

    const protocolCounts = {};
    let   transferBytes  = 0;

    for (const entry of allEntries) {
        transferBytes += entry.transferSize;

        const key = entry.transferSize === 0 && !entry.nextHopProtocol ? 'cached' : (entry.nextHopProtocol || 'unknown');

        protocolCounts[key] = (protocolCounts[key] || 0) + 1
    }

    return {
        requests         : allEntries.length,
        transferBytes,
        protocolCounts,
        workerWaterfallMs: workerWindows.length ? Math.max(...workerWindows) : 0,
        runtimeCheck
    }
}

/**
 * @summary Formats a CDP `Runtime.exceptionThrown` payload into a single-line diagnostic string.
 * @param {Object|null} details CDP `exceptionDetails` payload.
 * @returns {String|null} Compact exception summary and source location.
 */
function formatExceptionDetails(details) {
    if (!details) {
        return null
    }

    const
        summary = (details.exception?.description || details.text || 'Uncaught worker error').split('\n')[0],
        file    = details.url ? path.basename(details.url) : 'worker';

    return `${summary} (${file}:${(details.lineNumber || 0) + 1})`
}

/**
 * @summary Probes `dist/esbuild-probe` once under HTTP/2 clean link with fast fail-fast worker exception capture.
 * @param {Object} options Boot probe options.
 * @param {String} options.spkiBase64 Base64 SHA-256 SubjectPublicKeyInfo digest.
 * @param {String} options.origin Origin URL prefix for worker discovery filtering.
 * @param {String} options.url Entry HTML URL for the esbuild probe build.
 * @param {String} options.kind `'portal'` or `'starter'`.
 * @returns {Promise<{ok: Boolean, runtimeError?: String}>} Boot probe result.
 */
async function probeEsbuildRuntimeBoot({spkiBase64, origin, url, kind}) {
    const
        browser    = await chromium.launch({headless: true, args: chromiumArgsFor('h2', spkiBase64)}),
        context    = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1440, height: 1000}}),
        page       = await context.newPage(),
        pageCdp    = await context.newCDPSession(page),
        browserCdp = await browser.newBrowserCDPSession();

    let capturedError = null,
        resolveEarlyError;

    const earlyError = new Promise(resolve => {
        resolveEarlyError = resolve
    });

    const failFast = msg => {
        if (!capturedError && msg) {
            capturedError = msg;
            resolveEarlyError()
        }
    };

    page.on('pageerror', err => failFast(err.message));

    pageCdp.on('Target.attachedToTarget', ev => {
        if (['worker', 'service_worker'].includes(ev.targetInfo?.type)) {
            pageCdp.send('Target.sendMessageToTarget', {
                sessionId: ev.sessionId,
                message  : JSON.stringify({id: 1, method: 'Runtime.enable'})
            }).catch(() => {})
        }

        pageCdp.send('Target.sendMessageToTarget', {
            sessionId: ev.sessionId,
            message  : JSON.stringify({id: 2, method: 'Runtime.runIfWaitingForDebugger'})
        }).catch(() => {})
    });

    const onTargetMessage = ev => {
        try {
            const msg = JSON.parse(ev.message);

            if (msg.method === 'Runtime.exceptionThrown') {
                failFast(formatExceptionDetails(msg.params?.exceptionDetails))
            }
        } catch {
            // Ignore malformed target events
        }
    };

    pageCdp.on('Target.receivedMessageFromTarget', onTargetMessage);

    await pageCdp.send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: true, flatten: false});

    browserCdp.on('Target.targetCreated', async ({targetInfo}) => {
        if (['shared_worker', 'service_worker'].includes(targetInfo?.type) && (targetInfo.url || '').startsWith(origin)) {
            try {
                const {sessionId} = await browserCdp.send('Target.attachToTarget', {targetId: targetInfo.targetId, flatten: false});

                await browserCdp.send('Target.sendMessageToTarget', {
                    sessionId,
                    message: JSON.stringify({id: 1, method: 'Log.enable'})
                }).catch(() => {});
                await browserCdp.send('Target.sendMessageToTarget', {
                    sessionId,
                    message: JSON.stringify({id: 2, method: 'Runtime.enable'})
                }).catch(() => {})
            } catch {
                // Short-lived worker targets may detach before attach completes
            }
        }
    });

    browserCdp.on('Target.receivedMessageFromTarget', onTargetMessage);

    await browserCdp.send('Target.setDiscoverTargets', {discover: true});

    const loadAndWait = async () => {
        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 8000});
        await waitForDomStamp(
            page,
            kind === 'portal'
                ? {selector: '.portal-home-hero-container', visible: true}
                : {selector: 'body', text: 'Welcome to your new Neo.mjs App.', visible: false},
            0,
            8000
        )
    };

    try {
        const loadPromise = loadAndWait();

        loadPromise.catch(() => {});
        await Promise.race([
            loadPromise,
            earlyError.then(() => {
                throw new Error(capturedError)
            })
        ]);

        return capturedError ? {ok: false, runtimeError: capturedError.split('\n')[0].replace(/\|/g, '/')} : {ok: true}
    } catch (err) {
        const msg = (capturedError || err.message || 'Unknown worker boot failure').split('\n')[0].replace(/\|/g, '/');

        return {ok: false, runtimeError: msg}
    } finally {
        await browserCdp.detach().catch(() => {});
        await pageCdp.detach().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {})
    }
}

/**
 * @summary Evaluates whether a DOM document satisfies a readiness descriptor using standard CSS selectors and layout rects.
 * @param {Document} doc DOM document or compatible test mock.
 * @param {{selector: String, text?: String, visible?: Boolean}} step Readiness descriptor.
 * @returns {Boolean} True when at least one matched element satisfies optional text and visibility constraints.
 */
export function matchesStepInDom(doc, step) {
    const view = doc.defaultView || (typeof window !== 'undefined' ? window : null);

    for (const el of doc.querySelectorAll(step.selector)) {
        if (step.text && !(el.textContent || '').includes(step.text)) {
            continue
        }

        if (step.visible) {
            const style = view?.getComputedStyle?.(el);

            if (style && (style.display === 'none' || style.visibility === 'hidden')) {
                continue
            }

            if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
                continue
            }
        }

        return true
    }

    return false
}

/**
 * @summary Waits on the page's requestAnimationFrame cadence until a step matches and stamps `performance.now()`.
 * @param {Object} page Playwright Page.
 * @param {{selector: String, text?: String, visible?: Boolean}} step Readiness descriptor.
 * @param {Number} [baselineMs=0] Page `performance.now()` baseline (`0` measures from navigation start).
 * @param {Number} [timeout=90000] Timeout in milliseconds.
 * @returns {Promise<Number>} Elapsed milliseconds on the in-page clock.
 */
async function waitForDomStamp(page, step, baselineMs = 0, timeout = 90000) {
    const handle = await page.waitForFunction(({target, base}) => {
        for (const el of document.querySelectorAll(target.selector)) {
            if (target.text && !(el.textContent || '').includes(target.text)) continue;

            if (target.visible) {
                const style = getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || el.getClientRects().length === 0) continue
            }

            return {ms: Math.max(0, performance.now() - base)}
        }

        return null
    }, {target: step, base: baselineMs}, {polling: 'raf', timeout});

    try {
        return (await handle.jsonValue()).ms
    } finally {
        await handle.dispose?.().catch(() => {})
    }
}

/**
 * @summary Loads one build inside a fresh isolated Page of a shared browser context and collects in-page RAF stamps and CDP metrics.
 * @param {Object} options Execution parameters.
 * @param {Object} options.context Playwright BrowserContext holding HTTP/TLS/QUIC caches.
 * @param {Object} options.browserCdp Browser-level CDP session.
 * @param {String} options.origin Origin URL prefix for worker discovery and filtering.
 * @param {String} options.url Target HTML URL to measure.
 * @param {String} options.kind `'portal'` or `'starter'`.
 * @param {Number} [options.maxAttempts=2] Maximum navigation attempts on transient network or abort errors.
 * @returns {Promise<Object>} Single-run frame, interaction, lazy-load, and CDP resource metrics.
 */
export async function runSingleLoadInContext({context, browserCdp, origin, url, kind, maxAttempts = 2}) {
    const steps = kind === 'portal'
        ? {
            ready   : {selector: '.portal-home-hero-container', visible: true},
            interAct: page => page.locator('.portal-header-toolbar').getByRole('link', {name: 'Learn', exact: true}).click(),
            inter   : {selector: '.neo-app-content-container, .neo-tree-list', visible: true},
            lazyAct : page => page.locator('.portal-header-toolbar').getByRole('link', {name: 'Connect', exact: true}).click(),
            lazy    : {selector: '.portal-services-component h1', text: 'Connect', visible: true},
            lazyCls : 'Portal.view.services.Container'
        }
        : {
            ready   : {selector: 'body', text: 'Welcome to your new Neo.mjs App.', visible: false},
            interAct: page => page.click('text=Tab 2'),
            inter   : {selector: 'body', text: 'Have fun creating something awesome!', visible: false},
            lazyAct : page => page.click('text=Tab 3'),
            lazy    : {selector: '.starter-lazy-panel', text: 'Lazy module loaded', visible: true},
            lazyCls : 'MyApp.view.LazyPanel'
        };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const page = await context.newPage();

        try {
            await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});

            const frameMs = await waitForDomStamp(page, steps.ready, 0);

            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

            const ti = await page.evaluate(() => performance.now());
            await steps.interAct(page);
            const interactionMs = await waitForDomStamp(page, steps.inter, ti);

            const tl = await page.evaluate(() => performance.now());
            await steps.lazyAct(page);
            const lazyExtensionMs = await waitForDomStamp(page, steps.lazy, tl);

            const cdp = await collectCdpMetrics(page, origin, browserCdp, steps.lazyCls);

            return {frameMs, interactionMs, lazyExtensionMs, ...cdp}
        } catch (err) {
            if (attempt === maxAttempts) {
                throw err
            }

            await new Promise(resolve => setTimeout(resolve, 250))
        } finally {
            await page.close().catch(() => {});

            for (let i = 0; i < 10; i++) {
                const {targetInfos = []} = await browserCdp.send('Target.getTargets').catch(() => ({}));

                if (!targetInfos.some(t => t.type === 'worker' && (t.url || '').startsWith(origin))) {
                    break
                }

                await new Promise(resolve => setTimeout(resolve, 50))
            }
        }
    }
}

/**
 * @summary Builds both Portal and a freshly scaffolded Starter App from the checked-out commit.
 * @param {String} starterParent Temp parent directory holding the generated starter workspace.
 * @returns {Promise<{starterRoot: String, waterfalls: Object[], esbuildProbes: Object}>}
 */
async function buildSingleCommitApps(starterParent) {
    console.log('[1/4] Building Portal dist/production + dist/esm...');
    runOrThrow('npm', ['run', 'bundle-browser-deps'], {cwd: ROOT});
    runOrThrow('node', ['buildScripts/build/all.mjs', '-n', '-f', '-l', 'no', '-p', 'yes', '-t', 'yes', '-w', 'yes', '-e', 'prod'], {cwd: ROOT});
    runOrThrow('node', ['buildScripts/build/all.mjs', '-n', '-f', '-l', 'no', '-p', 'no',  '-t', 'yes', '-w', 'yes', '-e', 'esm'],  {cwd: ROOT});

    const portalProbe = await buildEsbuildSplittingProbe({
        workspaceRoot: ROOT,
        insideNeo    : true,
        entries      : PORTAL_LAZY_ENTRIES,
        rawAppEntry  : 'apps/portal/app.mjs'
    });

    console.log('[2/4] Packing engine and scaffolding Starter App (neo-app@13.4.1)...');
    fs.mkdirSync(starterParent, {recursive: true});

    const packDir = path.join(starterParent, 'pack');
    fs.mkdirSync(packDir, {recursive: true});
    runOrThrow('npm', ['pack', '--pack-destination', packDir], {cwd: ROOT});

    const tgzFile = fs.readdirSync(packDir).find(file => file.endsWith('.tgz'));
    if (!tgzFile) {
        throw new Error(`npm pack produced no .tgz archive in ${packDir}`)
    }
    const tgzPath = path.join(packDir, tgzFile);

    runOrThrow('npx', [
        '--yes', 'neo-app@13.4.1',
        '-w', 'starter', '-n', 'MyApp', '-t', 'neo-theme-dark',
        '-u', 'no', '-v', 'no', '-s', 'false', '--no-agent'
    ], {cwd: starterParent});

    const starterRoot = path.join(starterParent, 'starter');

    runOrThrow('npm', ['install', '--no-save', '--ignore-scripts', tgzPath, 'highlight.js@11.12.0'], {cwd: starterRoot});
    runOrThrow('npm', ['run', 'bundle-parse5'], {cwd: starterRoot});
    runOrThrow('npm', ['run', 'bundle-marked'], {cwd: starterRoot});

    // Add one lazy extension tab so `dist/esm` and `dist/production` both exercise lazy chunk/module loading
    fs.writeFileSync(path.join(starterRoot, 'apps/myapp/view/LazyPanel.mjs'), [
        "import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';",
        '',
        'class LazyPanel extends Component {',
        '    static config = {',
        "        className: 'MyApp.view.LazyPanel',",
        "        baseCls  : ['starter-lazy-panel'],",
        "        cls      : ['starter-lazy-panel'],",
        "        text     : 'Lazy module loaded'",
        '    }',
        '}',
        '',
        'export default Neo.setupClass(LazyPanel);'
    ].join('\n'));

    const viewportFile = path.join(starterRoot, 'apps/myapp/view/Viewport.mjs');
    const viewportCode = fs.readFileSync(viewportFile, 'utf8').replace(
        /text:\s*'Have fun creating something awesome!'\s*\}\]/,
        "text: 'Have fun creating something awesome!'\n            }, {\n                cls   : ['neo-examples-tab-component', 'starter-lazy-panel'],\n                header: {iconCls: 'fa fa-bolt', text: 'Tab 3'},\n                module: () => import('./LazyPanel.mjs')\n            }]"
    );
    if (!viewportCode.includes('LazyPanel.mjs')) {
        throw new Error(`Could not inject Tab 3 LazyPanel into ${viewportFile}`)
    }
    fs.writeFileSync(viewportFile, viewportCode);

    runOrThrow('node', ['./node_modules/neo.mjs/buildScripts/build/all.mjs', '-n', '-l', 'no', '-p', 'no', '-t', 'yes', '-w', 'yes', '-e', 'prod'], {cwd: starterRoot});
    runOrThrow('node', ['./node_modules/neo.mjs/buildScripts/build/all.mjs', '-n', '-l', 'no', '-p', 'no', '-t', 'yes', '-w', 'yes', '-e', 'esm'],  {cwd: starterRoot});

    const starterProbe = await buildEsbuildSplittingProbe({
        workspaceRoot: starterRoot,
        insideNeo    : false,
        entries      : ['apps/myapp/app.mjs', 'apps/myapp/view/LazyPanel.mjs'],
        rawAppEntry  : 'apps/myapp/app.mjs'
    });

    const waterfalls = [
        {label: 'App Worker (`src/worker/App.mjs`)', ...computeImportWaterfallDepth(path.join(ROOT, 'src/worker/App.mjs'), ROOT)},
        {label: 'Portal App (`apps/portal/app.mjs`)', ...computeImportWaterfallDepth(path.join(ROOT, 'apps/portal/app.mjs'), ROOT)},
        {label: 'Starter App (`apps/myapp/app.mjs`)', ...computeImportWaterfallDepth(path.join(starterRoot, 'dist/esm/apps/myapp/app.mjs'), path.join(starterRoot, 'dist/esm'))}
    ];

    return {starterRoot, waterfalls, esbuildProbes: {portal: portalProbe, starter: starterProbe}}
}

/**
 * @summary Executes one cold or warm measurement cell and returns an error row instead of aborting on cell failure.
 * @param {Object} options Cell execution inputs.
 * @returns {Promise<Object>} Summarized cell payload or tabular error row.
 */
async function measureSeriesCell({protocol, arm, app, build, cache, runs, spkiBase64, onBrowserVersion}) {
    const
        items            = [],
        withBenchContext = async fn => {
        const browser = await chromium.launch({headless: true, args: chromiumArgsFor(protocol, spkiBase64)});
        let context, cdp;

        onBrowserVersion(browser.version());
        try {
            context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1440, height: 1000}});
            cdp     = await browser.newBrowserCDPSession();
            await fn(context, cdp)
        } finally {
            await cdp?.detach().catch(() => {});
            await context?.close().catch(() => {});
            await browser.close()
        }
    };

    try {
        if (cache === 'warm') {
            await withBenchContext(async (context, browserCdp) => {
                await runSingleLoadInContext({context, browserCdp, origin: app.origin, url: build.url, kind: app.key});

                for (let r = 0; r < runs; r++) {
                    items.push(await runSingleLoadInContext({context, browserCdp, origin: app.origin, url: build.url, kind: app.key}))
                }
            })
        } else {
            for (let r = 0; r < runs; r++) {
                await withBenchContext(async (context, browserCdp) => {
                    items.push(await runSingleLoadInContext({context, browserCdp, origin: app.origin, url: build.url, kind: app.key}))
                })
            }
        }

        return {
            build       : build.name,
            protocol,
            link        : arm.label,
            cache,
            summary     : summarizeFiveRuns(items, protocol, cache === 'cold'),
            runtimeCheck: items[0]?.runtimeCheck
        }
    } catch (err) {
        return {build: build.name, protocol, link: arm.label, cache, error: (err.message || String(err)).split('\n')[0].replace(/\|/g, '/')}
    }
}

/**
 * @summary CLI entrypoint parsing arguments, managing the Linux `ip netns` harness, and writing reports.
 * @returns {Promise<void>}
 */
async function main() {
    const argv      = process.argv.slice(2),
          flagValue = name => {
              const idx = argv.indexOf(name);
              return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : null
          };

    const
        runs          = Number(flagValue('--runs') || 5),
        mdPath        = flagValue('--output-markdown') || 'measurement-report.md',
        jsonPath      = flagValue('--output-json')     || 'measurement-raw.json',
        skipBuild     = argv.includes('--skip-build'),
        starterArg    = flagValue('--starter-root'),
        tmpWork       = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-measure-')),
        starterParent = path.join(tmpWork, 'starter-parent'),
        starterRoot   = starterArg ? path.resolve(starterArg) : path.join(starterParent, 'starter');

    let buildArtifacts = {
        starterRoot,
        waterfalls   : [
            {label: 'App Worker (`src/worker/App.mjs`)', ...computeImportWaterfallDepth(path.join(ROOT, 'src/worker/App.mjs'), ROOT)},
            {label: 'Portal App (`apps/portal/app.mjs`)', ...computeImportWaterfallDepth(path.join(ROOT, 'apps/portal/app.mjs'), ROOT)}
        ],
        esbuildProbes: {}
    };

    if (skipBuild) {
        const starterEntry = path.join(starterRoot, 'dist/esm/apps/myapp/app.mjs');

        if (!starterArg || !fs.existsSync(starterEntry)) {
            throw new Error(`--skip-build requires --starter-root pointing to a built starter app (${starterEntry} missing)`)
        }

        buildArtifacts.waterfalls.push({
            label: 'Starter App (`apps/myapp/app.mjs`)',
            ...computeImportWaterfallDepth(starterEntry, path.join(starterRoot, 'dist/esm'))
        })
    } else {
        buildArtifacts = await buildSingleCommitApps(starterParent)
    }

    if (os.platform() !== 'linux') {
        throw new Error(`OS link shaping via ip netns + tc netem requires Linux; current platform is ${os.platform()}`)
    }

    const
        certs  = createSelfSignedCert(path.join(tmpWork, 'certs')),
        commit = runOrThrow('git', ['rev-parse', '--short', 'HEAD'], {cwd: ROOT}),
        caddyV = runOrThrow('caddy', ['version']);

    let browserVersion = 'unknown';

    // Set up isolated server namespace connected over veth pair for physical RTT/loss simulation
    runOrThrow('sudo', ['ip', 'netns', 'add', NETNS_NAME]);
    try {
        runOrThrow('sudo', ['ip', 'link', 'add', HOST_VETH, 'type', 'veth', 'peer', 'name', SRV_VETH]);
        runOrThrow('sudo', ['ip', 'link', 'set', SRV_VETH, 'netns', NETNS_NAME]);
        runOrThrow('sudo', ['ip', 'addr', 'add', `${HOST_IP}/24`, 'dev', HOST_VETH]);
        runOrThrow('sudo', ['ip', 'link', 'set', HOST_VETH, 'up']);
        runOrThrow('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'ip', 'link', 'set', 'lo', 'up']);
        runOrThrow('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'ip', 'addr', 'add', `${SRV_IP}/24`, 'dev', SRV_VETH]);
        runOrThrow('sudo', ['ip', 'netns', 'exec', NETNS_NAME, 'ip', 'link', 'set', SRV_VETH, 'up']);

        const
            makeApp    = (key, title, port, appDir) => {
                const origin = `https://${HOST_DOMAIN}:${port}`;

                return {
                    key,
                    title,
                    origin,
                    probeUrl: `${origin}/dist/esbuild-probe/${appDir}/index.html`,
                    builds  : [
                        {name: 'dist/esm',        url: `${origin}/dist/esm/${appDir}/index.html`},
                        {name: 'dist/production', url: `${origin}/dist/production/${appDir}/index.html`}
                    ]
                }
            },
            apps       = [
                makeApp('portal',  'Portal (`apps/portal`)', PORTAL_PORT,  'apps/portal'),
                makeApp('starter', 'Starter App (`MyApp`)',  STARTER_PORT, 'apps/myapp')
            ],
            cellsByApp = {portal: [], starter: []};

        // Raise kernel UDP receive/send buffers so QUIC / HTTP/3 bursts under emulated latency/loss do not stall
        spawnSync('sudo', ['sysctl', '-w', 'net.core.rmem_max=7500000', 'net.core.wmem_max=7500000'], {stdio: 'ignore'});

        for (const protocol of ['h2', 'h3']) {
            applyNetemArm(LINK_ARMS[0]);

            const caddy = await startCaddyInNetns({
                certPath   : certs.certPath,
                keyPath    : certs.keyPath,
                neoRoot    : ROOT,
                starterRoot: buildArtifacts.starterRoot,
                protocol,
                workDir    : tmpWork
            });

            try {
                if (protocol === 'h2') {
                    for (const app of apps) {
                        if (buildArtifacts.esbuildProbes[app.key]?.ok) {
                            const boot = await probeEsbuildRuntimeBoot({
                                spkiBase64: certs.spkiBase64,
                                origin    : app.origin,
                                url       : app.probeUrl,
                                kind      : app.key
                            });

                            if (boot.ok) {
                                app.builds.push({name: 'dist/esbuild-probe', url: app.probeUrl})
                            } else {
                                buildArtifacts.esbuildProbes[app.key].runtimeError = boot.runtimeError;
                                cellsByApp[app.key].push({
                                    build   : 'dist/esbuild-probe',
                                    protocol: 'h2',
                                    link    : LINK_ARMS[0].label,
                                    cache   : 'cold',
                                    error   : boot.runtimeError
                                })
                            }
                        }
                    }
                }

                for (const arm of LINK_ARMS) {
                    applyNetemArm(arm);
                    console.log(`[3/4] Measuring protocol=${protocol}, link=${arm.id}...`);

                    for (const app of apps) {
                        for (const build of app.builds) {
                            for (const cache of ['cold', 'warm']) {
                                cellsByApp[app.key].push(await measureSeriesCell({
                                    protocol,
                                    arm,
                                    app,
                                    build,
                                    cache,
                                    runs,
                                    spkiBase64      : certs.spkiBase64,
                                    onBrowserVersion: v => {
                                        browserVersion = v
                                    }
                                }))
                            }
                        }
                    }
                }
            } finally {
                await caddy.stop()
            }
        }

        const report = {
            meta: {
                commit,
                machine: `${os.platform()} ${os.release()} (${os.arch()}, ${os.cpus().length} vCPUs)`,
                browser: `Chromium ${browserVersion}`,
                server : caddyV,
                command: `node buildScripts/util/measure-esm-vs-bundled.mjs --runs ${runs}`,
                runs
            },
            waterfalls   : buildArtifacts.waterfalls,
            esbuildProbes: buildArtifacts.esbuildProbes,
            apps         : apps.map(a => ({title: a.title, cells: cellsByApp[a.key]}))
        };

        const markdown = formatMeasurementMarkdown(report);
        fs.writeFileSync(mdPath, markdown);
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        console.log('[4/4] Report written to', mdPath)
    } finally {
        spawnSync('sudo', ['ip', 'netns', 'del', NETNS_NAME], {stdio: 'ignore'});
        fs.rmSync(path.join(ROOT, 'dist/esbuild-probe'), {recursive: true, force: true});
        fs.rmSync(tmpWork, {recursive: true, force: true})
    }
}

if (isEntryModule(import.meta.url)) {
    main().catch(err => {
        console.error(err);
        process.exit(1)
    })
}
