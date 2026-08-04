#!/usr/bin/env node
import fs              from 'fs-extra';
import path            from 'path';
import {execFile}      from 'node:child_process';
import {promisify}     from 'node:util';
import {fileURLToPath} from 'url';

import {buildMigrationPlan, formatPlan, parseObservedEnv, resolveCensus} from './deploymentMigrationCore.mjs';

/**
 * @module ai/scripts/maintenance/migrateDeployment
 * @summary Operator-invoked migration bootstrap for a lagging Agent OS deployment: `plan` joins
 * the discover driver's contract delta with the plane-side facts only this tool observes and reports whether
 * a migration is authorized; `apply` runs the shipped safe deploy pipeline at a pinned revision, and
 * only after a clean plan.
 *
 * ## Usage
 *
 * ```
 * node ai/scripts/maintenance/migrateDeployment.mjs plan  [--target dev] [--project NAME]
 * node ai/scripts/maintenance/migrateDeployment.mjs apply --target <sha>
 * ```
 *
 * ## Why plan-then-apply rather than a caller
 *
 * Wiring the pipeline alone would rebuild a still-invalid configuration and land on the same unhealthy
 * plane — loudly, via the health gate, but no closer to running. The orchestrator's authority role is
 * the worked case: its leaf carries NO default, so a deployment that does not declare
 * `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE` produces a refused launch that writes no state directory, no
 * PID file and no log. The config delta decides whether the migration can work at all; the revision
 * delta is secondary.
 *
 * ## Why this tool derives the contract delta itself
 *
 * An earlier revision consumed the delta as JSON from a separate discovery driver, carrying no
 * derivation of its own so that two resolvers could not disagree. That reasoning was sound and its
 * premise is gone: the separate driver was closed as not-planned, priced at a new CLI contract, JSON
 * schema, tests, documentation and an ongoing compatibility surface. Those are costs of the SPLIT, not
 * of the capability, so folding derivation in removes all of them and still leaves exactly one
 * resolver. Its authority is `ai/scripts/lint/config-leaf-parity.json`, the executable copy of the
 * classified key lists — never a transcription of them.
 *
 * ## Why the target's Compose identity is discovered
 *
 * `deploy-pipeline.sh` takes a `--project-name` defaulting to `neo-agent-os`, and real planes are not
 * built that way: the canonical local plane runs `docker-compose.yml` plus
 * `docker-compose.local-agent-os.yml` under project `neo-local-agent-os`. Invoking the pipeline with
 * its defaults would drop the overlay and address a different project, so both values are read off the
 * running containers' `com.docker.compose.*` labels and the run is refused when they cannot be.
 *
 * ## Why no Neo/AiConfig bootstrap
 *
 * This driver reads no config leaf; its inputs are a sibling driver's JSON and the Docker plane.
 * Staying Neo-free keeps it runnable against a deployment whose own config tree is the thing under
 * suspicion.
 */

const execFileAsync = promisify(execFile),
      scriptDir     = path.dirname(fileURLToPath(import.meta.url)),
      repoRoot      = path.resolve(scriptDir, '../../..'),
      PARITY_REL    = 'ai/scripts/lint/config-leaf-parity.json',
      PIPELINE_REL  = 'ai/examples/cloud-deployment/deploy-pipeline.sh',
      DEFAULT_REPO  = 'https://github.com/neomjs/neo.git',
      /**
       * The cohort whose `/app/.neo-revision` must move for a migration to count as delivered.
       * Overridable with `--services`; every listed service is asserted, so an under-listed cohort
       * narrows the proof rather than widening the pass.
       * @type {String[]}
       */
      DEFAULT_SERVICES = ['mc-server', 'orchestrator', 'kb-server'];

/**
 * @summary Runs a command, returning `{ok, stdout, stderr, code}` instead of throwing.
 *
 * Docker absence, a stopped daemon and a missing container are ORDINARY inputs to a plan — each
 * becomes a named blocker or an unchecked item. Throwing would collapse "the deployment is
 * unreachable" into the same shape as "this driver has a bug".
 * @param {String}   command
 * @param {String[]} args
 * @param {Object}   [env] Extra environment for the child; merged over `process.env`.
 * @returns {Promise<Object>} `{ok, stdout, stderr, code}`
 */
async function run(command, args, env) {
    try {
        const {stdout, stderr} = await execFileAsync(command, args, {
            cwd      : repoRoot,
            maxBuffer: 16 * 1024 * 1024,
            env      : env ? {...process.env, ...env} : process.env
        });

        return {ok: true, stdout: stdout.trim(), stderr: stderr.trim(), code: 0}
    } catch (error) {
        return {ok: false, stdout: (error.stdout || '').trim(), stderr: (error.stderr || error.message || '').trim(), code: error.code ?? 1}
    }
}

/**
 * @summary Parses argv, refusing an unknown mode or flag.
 * @param {String[]} argv `process.argv.slice(2)`
 * @returns {Object} `{mode, target, project, profile, services, repoUrl}`
 * @throws {Error} On a missing/unknown mode, an unknown flag, or a flag without a value.
 */
export function parseArgs(argv) {
    const [mode, ...rest] = argv,
          options         = {
              mode,
              target  : 'dev',
              project : null,
              profile : 'ai/deploy/docker-compose.yml',
              services: DEFAULT_SERVICES,
              repoUrl : process.env.NEO_REPO_URL || DEFAULT_REPO,
              omitted : null,
              // Service name → `{KEY: value}`, populated by repeatable `--set`. Empty by default, so a
              // deployment is never silently reconfigured by a value the operator did not name.
              desiredEnv: {}
          };

    if (mode !== 'plan' && mode !== 'apply') {
        throw new Error(`first argument must be 'plan' or 'apply' (received: ${mode || '<none>'})`)
    }

    for (let i = 0; i < rest.length; i += 2) {
        const flag  = rest[i],
              value = rest[i + 1];

        if (value === undefined) {
            throw new Error(`flag ${flag} requires a value`)
        }

        switch (flag) {
            case '--target'       : options.target       = value; break;
            case '--project'      : options.project      = value; break;
            case '--profile'      : options.profile      = value; break;
            case '--repo-url'     : options.repoUrl      = value; break;
            case '--services'     : options.services     = value.split(',').map(entry => entry.trim()).filter(Boolean); break;

            // The repair carrier. `--set <service>.<KEY>=<value>`, repeatable: a required input the target
            // is missing becomes a declared transition instead of a terminal blocker, which is the whole
            // difference between a tool that diagnoses a broken plane and one that can fix it. Splitting on
            // the FIRST `=` only, because values legitimately contain `=`.
            case '--set': {
                const separator = value.indexOf('='),
                      lhs       = separator === -1 ? value : value.slice(0, separator),
                      dot       = lhs.indexOf('.');

                if (separator === -1 || dot === -1) {
                    throw new Error(`--set expects <service>.<KEY>=<value>, received: ${value}`)
                }

                const service = lhs.slice(0, dot),
                      key     = lhs.slice(dot + 1);

                options.desiredEnv[service] ||= {};
                options.desiredEnv[service][key] = value.slice(separator + 1);
                break
            }
            default               : throw new Error(`unknown flag: ${flag}`)
        }
    }

    return options
}

/**
 * @summary Finds the target's Compose project by asking which project owns the cohort's containers.
 *
 * Ambiguity is refused rather than resolved, mirroring the pipeline's own `match_count -ne 1` abort:
 * on a host running several planes, picking one would migrate a deployment the operator did not name.
 * Stopped containers count — a dead deployment is exactly the case this tool exists for.
 * @param {String[]}    services
 * @param {String|null} declaredProject Skips discovery when the operator named one.
 * @returns {Promise<Object>} `{project, error}` — `project` is `null` when undiscoverable.
 */
async function discoverProject(services, declaredProject) {
    if (declaredProject) {
        return {project: declaredProject, error: null}
    }

    const projects = new Set();

    for (const service of services) {
        const result = await run('docker', [
            'ps', '-a',
            '--filter', `label=com.docker.compose.service=${service}`,
            '--format', '{{.Label "com.docker.compose.project"}}'
        ]);

        if (result.ok) {
            result.stdout.split('\n').map(line => line.trim()).filter(Boolean).forEach(project => projects.add(project))
        }
    }

    if (projects.size === 1) {
        return {project: [...projects][0], error: null}
    }

    return {
        project: null,
        error  : projects.size === 0
            ? 'no container carries a com.docker.compose.service label from the requested cohort'
            : `cohort containers span ${projects.size} Compose projects (${[...projects].join(', ')}) — name one with --project`
    }
}

/**
 * @summary Reads the plane-side facts: Compose identity from container labels and each service's
 * `/app/.neo-revision`.
 * @param {String}   project
 * @param {String[]} services
 * @returns {Promise<Object>} `{composeIdentity, deployedRevisions, unchecked, observedEnvByService}`
 */
async function inspectPlane(project, services) {
    const deployedRevisions    = {},
          unchecked            = [],
          observedEnvByService = {};

    let composeIdentity = null;

    for (const service of services) {
        const lookup = await run('docker', [
            'ps', '-a',
            '--filter', `label=com.docker.compose.project=${project}`,
            '--filter', `label=com.docker.compose.service=${service}`,
            '--format', '{{.Names}}'
        ]);

        const containerName = lookup.ok ? lookup.stdout.split('\n')[0]?.trim() : '';

        if (!containerName) {
            deployedRevisions[service] = null;
            unchecked.push(`service '${service}': no container under project '${project}' — not inspected`);
            continue
        }

        const inspected = await run('docker', ['inspect', containerName, '--format', '{{json .Config}}']);

        let parsedConfig = null;

        if (inspected.ok) {
            try {
                parsedConfig = JSON.parse(inspected.stdout)
            } catch (error) {
                unchecked.push(`service '${service}': container config was not parseable JSON — ${error.message}`)
            }
        }

        // Env is kept PER SERVICE. A union was the earlier shape and it is fail-open, not conservative:
        // it only ever shrinks the delta, so a key set on one container and absent from another reports
        // as satisfied for both and the real misconfiguration disappears. Measured on the canonical
        // profile, four of thirteen required inputs are declared by a single service and one more by two
        // of three, so a union both credits a service with configuration it does not carry and holds it
        // to keys it never declares.
        if (parsedConfig) {
            observedEnvByService[service] = parseObservedEnv(parsedConfig.Env || [])
        }

        if (parsedConfig && !composeIdentity) {
            // The first service that yields labels establishes the plane's identity: every service in
            // one project shares it, so reading it from whichever service answered keeps a single
            // missing container from losing the identity entirely.
            {
                const labels      = parsedConfig.Labels || {},
                      configFiles = (labels['com.docker.compose.project.config_files'] || '')
                          .split(',').map(entry => entry.trim()).filter(Boolean);

                if (configFiles.length) {
                    composeIdentity = {
                        project   : labels['com.docker.compose.project'] || project,
                        configFiles,
                        workingDir: labels['com.docker.compose.project.working_dir'] || null
                    }
                }
            }
        }

        const revision = await run('docker', ['exec', containerName, 'cat', '/app/.neo-revision']);

        deployedRevisions[service] = revision.ok && revision.stdout ? revision.stdout.split(/\s+/)[0] : null;

        if (!deployedRevisions[service]) {
            unchecked.push(`service '${service}': /app/.neo-revision unreadable (container may be stopped) — ${revision.stderr || 'no detail'}`)
        }
    }

    return {composeIdentity, deployedRevisions, unchecked, observedEnvByService}
}

/**
 * @summary Resolves a selector to exactly one commit id against the remote.
 *
 * Uses the same `ls-remote <sel> <sel>^{}` shape the pipeline uses, for the same reason: an annotated
 * tag advertises both its tag object and its peeled commit, and the tag object is not what Docker
 * checks out. This is not a second resolver competing with the pipeline's — the resolved id is handed
 * BACK to the pipeline as a 40-hex `NEO_REF`, which re-verifies it against its own remote and aborts on
 * disagreement. Two independent confirmations of one pin; any divergence fails closed.
 * @param {String} repoUrl
 * @param {String} selector
 * @returns {Promise<Object>} `{revision, error}`
 */
async function resolveTargetRevision(repoUrl, selector) {
    if (/^[0-9a-f]{40}$/.test(selector)) {
        return {revision: selector, error: null}
    }

    const result = await run('git', ['ls-remote', repoUrl, selector, `${selector}^{}`]);

    if (!result.ok) {
        return {revision: null, error: `git ls-remote failed for '${selector}' at ${repoUrl}: ${result.stderr || 'no detail'}`}
    }

    const rows = result.stdout.split('\n').map(line => line.split('\t')).filter(parts => parts.length === 2),
          // Ambiguity is decided on the NON-peel refs, exactly as the pipeline does: a selector
          // matching both a branch and an annotated tag is ambiguous, and preferring the peel first
          // would collapse that to one silent winner.
          plainRefs = rows.filter(([, ref]) => !ref.endsWith('^{}'));

    if (plainRefs.length !== 1) {
        return {revision: null, error: `selector '${selector}' matched ${plainRefs.length} refs at ${repoUrl}; expected exactly 1`}
    }

    const [, matchedRef] = plainRefs[0],
          peeled         = rows.find(([, ref]) => ref === `${matchedRef}^{}`);

    return {revision: (peeled || plainRefs[0])[0], error: null}
}

/**
 * @summary Loads the classified census for one profile, returning a named failure rather than throwing.
 * @param {String} profile Repo-relative Compose path.
 * @returns {Promise<Object>} `{census, parity, error}` — `parity` carries the raw document so the
 * per-service scope resolver reads the same authority without a second filesystem round-trip.
 */
async function loadCensus(profile) {
    const parityPath = path.join(repoRoot, PARITY_REL);

    if (!await fs.pathExists(parityPath)) {
        return {census: null, parity: null, error: `${PARITY_REL} is absent — it is this tool's contract authority`}
    }

    try {
        const parity = await fs.readJson(parityPath);

        return {census: resolveCensus(parity, profile), parity, error: null}
    } catch (error) {
        return {census: null, parity: null, error: error.message}
    }
}

/**
 * @summary Resolves each service's declared env surface, so the census is judged per service.
 *
 * The census classifies keys per **profile**; the profile block names which config template governs each
 * service, and that template is the per-service authority. `buildConfigEnvDefaultsForTemplate` is the
 * same resolver the parity lint used to compute the census, so this derives the scope from the existing
 * authority rather than introducing a second mapping free to drift from it.
 *
 * A service whose scope cannot be resolved is returned absent rather than defaulted to the whole census:
 * the plan gate refuses on that, because evaluating every profile key against one service invents
 * obligations it never declared.
 * @param {Object}   parity  The parsed parity document.
 * @param {String}   profile Repo-relative Compose path.
 * @param {String[]} services Service names to resolve.
 * @returns {Promise<Object>} `{serviceScopes, errors}` — scopes keyed by service, unresolved names in `errors`.
 */
async function resolveServiceScopes(parity, profile, services) {
    const declared      = parity?.$composeDefaultParity?.profiles?.[profile]?.services || {},
          serviceScopes = {},
          errors        = [];

    for (const service of services) {
        const template = declared[service];

        if (!template) {
            errors.push(`service '${service}' is not declared under $composeDefaultParity.profiles['${profile}'].services`);
            continue
        }

        try {
            const {buildConfigEnvDefaultsForTemplate} = await import('../lint/lint-config-template-ssot.mjs');

            serviceScopes[service] = new Set(Object.keys(await buildConfigEnvDefaultsForTemplate({template})))
        } catch (error) {
            errors.push(`service '${service}': could not resolve declared env from '${template}' — ${error.message}`)
        }
    }

    return {serviceScopes, errors}
}

/**
 * @summary Invokes the shipped pipeline at the pinned revision with the discovered Compose identity.
 *
 * Everything the pipeline needs arrives as environment because the pipeline owns those contracts: this
 * driver re-implements none of its preflight, project pinning or health gating.
 * @param {Object} plan
 * @param {Object} composeIdentity
 * @returns {Promise<Number>} The pipeline's exit code.
 */
/**
 * @summary Builds the exact environment handed to the pipeline — the invocation boundary, as a pure value.
 *
 * Extracted so the boundary is assertable without spawning the pipeline: the property under test is that
 * a declared repair actually crosses into the transaction, and a test that only proved `invokePipeline`
 * was called would pass while the values were dropped. That was the defect this function exists to close.
 * @param {Object} plan            Output of `buildMigrationPlan`.
 * @param {Object} composeIdentity `{project, configFiles}` discovered off the running plane.
 * @param {Object} [desiredEnv]    Service name → `{KEY: value}`.
 * @returns {Object} `{pipelineEnv, forwarded}` — the env map, and the keys contributed by the repair.
 */
export function buildPipelineEnv(plan, composeIdentity, desiredEnv = {}) {
    const desiredFlat = {};

    Object.values(desiredEnv || {}).forEach(entries => Object.assign(desiredFlat, entries || {}));

    return {
        pipelineEnv: {
            NEO_REF                : plan.revisionDelta.to,
            NEO_DEPLOY_PROJECT_NAME: composeIdentity.project,
            NEO_DEPLOY_COMPOSE_FILE: composeIdentity.configFiles.join(path.delimiter),
            ...desiredFlat
        },
        forwarded  : Object.keys(desiredFlat)
    }
}

async function invokePipeline(plan, composeIdentity, desiredEnv = {}) {
    // The declared repair has to reach the actual transaction, or `plan` records a transition `apply`
    // cannot perform. Compose interpolation is the transport: the profile parameterises these leaves as
    // `${NEO_*}`, so forwarding them as environment is what makes the recreate carry the new config.
    // The plan already refuses when two services disagree on one key, because this transport is global.
    const {pipelineEnv, forwarded: forwardedKeys} = buildPipelineEnv(plan, composeIdentity, desiredEnv);

    console.log(`[migrate] invoking ${PIPELINE_REL}`);

    // Keys only for the forwarded repair. A required input's VALUE is operator-supplied config and may be
    // a host, a path or a credential-adjacent string; echoing it into a build log would persist it.
    Object.entries(pipelineEnv)
        .filter(([key]) => !forwardedKeys.includes(key))
        .forEach(([key, value]) => console.log(`[migrate]   ${key}=${value}`));

    if (forwardedKeys.length) {
        console.log(`[migrate]   forwarding ${forwardedKeys.length} declared config value(s): ${forwardedKeys.join(', ')}`)
    }

    const child = await run('bash', [path.join(repoRoot, PIPELINE_REL)], pipelineEnv);

    // The pipeline's own output is the operator-facing record of the transition; forward it whole
    // rather than summarizing, because its abort messages name the exact refusal condition.
    if (child.stdout) console.log(child.stdout);
    if (child.stderr) console.error(child.stderr);

    return child.ok ? 0 : (child.code || 1)
}

/**
 * @summary Drives one `plan` or `apply` run.
 * @returns {Promise<Number>} `0` on a clean plan or a delivered apply; non-zero on any refusal.
 */
async function main() {
    let options;

    try {
        options = parseArgs(process.argv.slice(2))
    } catch (error) {
        console.error(`[migrate] FATAL: ${error.message}`);
        console.error('[migrate] usage: migrateDeployment.mjs plan|apply [--target <selector>] [--project <name>] [--profile <compose-path>] [--services a,b,c] [--set <service>.<KEY>=<value> ...]');
        return 2
    }

    console.log(`[migrate] mode:     ${options.mode}`);
    console.log(`[migrate] profile:  ${options.profile}`);
    console.log(`[migrate] selector: ${options.target}`);

    const {census, parity, error: censusError} = await loadCensus(options.profile);

    if (censusError) {
        console.error(`[migrate] FATAL: ${censusError}`);
        return 2
    }

    console.log(`[migrate] contract: ${census.requiredDeploymentInputs.length} required, ${Object.keys(census.forbiddenEnv).length} forbidden, ${census.secrets.length} secret(s)`);

    const {project, error: projectError} = await discoverProject(options.services, options.project);

    if (!project) {
        console.error(`[migrate] FATAL: Compose project undiscoverable — ${projectError}`);
        return 2
    }

    const [{composeIdentity, deployedRevisions, unchecked, observedEnvByService}, {revision: targetRevision, error: targetError}] = await Promise.all([
        inspectPlane(project, options.services),
        resolveTargetRevision(options.repoUrl, options.target)
    ]);

    if (targetError) {
        unchecked.push(`target revision: ${targetError}`)
    }

    // Overlay staleness is a SEPARATE defect class from a missing env key, and this tool does not
    // detect it: the target's own `ai/config.mjs` is needed, and a deployment this host does not own
    // will not surrender it. Reported as NOT VERIFIED rather than omitted, because the two have
    // different remediations — a stale overlay wants an overlay migration, not an env edit — and a
    // consumer that saw only "env delta clean" would conclude the wrong repair.
    //
    // It matters more than an ordinary gap: the config-freshness guard throws on staleness BEFORE it
    // reaches its required-input listing, so on a stale target the missing-env report is unreachable
    // and a start-and-parse-the-failure approach would return a migration instruction where a delta
    // was expected. This driver reads container env directly and never parses a startup failure, so
    // it is not exposed to that ordering — but the blind spot is real and stays named.
    // (@neo-opus-ada's finding on the source ticket; the ordering is verified in `initServerConfigs.mjs`.)
    unchecked.push(
        "config-overlay drift: NOT evaluated — needs the target's own ai/config.mjs. A stale overlay is a " +
        'different repair (overlay migration) from a missing key, and a clean env delta does not rule it out'
    );

    const {serviceScopes, errors: scopeErrors} = await resolveServiceScopes(parity, options.profile, options.services);

    // A scope that failed to resolve is reported, never defaulted. The plan gate blocks on the missing
    // scope itself, so this only needs to carry the reason an operator would otherwise have to guess at.
    scopeErrors.forEach(message => unchecked.push(`declared-scope resolution: ${message}`));

    const plan = buildMigrationPlan({
        observedEnvByService,
        serviceScopes,
        census,
        desiredEnv    : options.desiredEnv,
        composeIdentity,
        deployedRevisions,
        targetRevision,
        uncheckedNotes: unchecked
    });

    console.log('');
    console.log(formatPlan(plan));

    if (options.mode === 'plan') {
        return plan.clean ? 0 : 1
    }

    if (!plan.clean) {
        console.error('');
        console.error(`[migrate] FATAL: apply refused — the plan reports ${plan.blockers.length} blocker(s) above. Docker was NOT invoked.`);
        return 1
    }

    console.log('');
    console.log('[migrate] plan is clean — applying');

    const pipelineCode = await invokePipeline(plan, composeIdentity, options.desiredEnv);

    if (pipelineCode !== 0) {
        console.error(`[migrate] FATAL: pipeline exited ${pipelineCode}; the transition did not complete.`);
        return pipelineCode
    }

    // The pipeline's success means the containers are HEALTHY, not that they carry the target code.
    // A health-gated recreate proves the containers are up, not that they carry the target code. So the
    // revision is re-read per service and compared to the pin.
    console.log('');
    console.log('[migrate] verifying /app/.neo-revision moved on every service...');

    const after   = await inspectPlane(project, options.services),
          unmoved = Object.entries(after.deployedRevisions).filter(([, revision]) => revision !== plan.revisionDelta.to);

    Object.entries(after.deployedRevisions).forEach(([service, revision]) => {
        console.log(`[migrate]   ${service}: ${plan.revisionDelta.from || '<unreadable>'} -> ${revision || '<unreadable>'}`)
    });

    if (unmoved.length) {
        console.error(`[migrate] FATAL: ${unmoved.length} service(s) are not at ${plan.revisionDelta.to} — the migration is NOT delivered.`);
        return 1
    }

    console.log(`[migrate] all ${options.services.length} service(s) at ${plan.revisionDelta.to} — migration delivered`);

    return 0
}

// Entrypoint guard (the `bootstrapWorktree.mjs:1502` form — `path.resolve` rather than a `file://`
// string compare, so a relative or symlinked invocation still matches). Without it, a spec importing
// `parseArgs` would execute a real migration driver as an import side effect.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
    process.exitCode = await main()
}
