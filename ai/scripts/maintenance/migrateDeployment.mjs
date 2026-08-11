#!/usr/bin/env node

/**
 * @plane host
 */
import fs              from 'fs-extra';
import os              from 'node:os';
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
       * The env keys that DEFINE the transaction rather than the config being repaired: the pinned
       * revision and the discovered plane identity. A repair carrier that could set these would let the
       * same flag redirect the run to another revision or another project, so they are reserved.
       * @type {Set<String>}
       */
      RESERVED_TRANSACTION_KEYS = new Set(['NEO_REF', 'NEO_DEPLOY_PROJECT_NAME', 'NEO_DEPLOY_COMPOSE_FILE']),
      /**
       * The cohort whose `/app/.neo-revision` must move for a migration to count as delivered.
       * Overridable with `--services`; every listed service is asserted, so an under-listed cohort
       * narrows the proof rather than widening the pass.
       * @type {String[]}
       */
      DEFAULT_SERVICES = ['mc-server', 'orchestrator', 'kb-server'],
      /**
       * The config cohort is WIDER than the revision cohort, and conflating them was a defect.
       *
       * `/app/.neo-revision` is written by the Neo image, so only Neo services can produce a revision
       * receipt — an ingress proxy has no such file. But the deployment contract spans services the receipt
       * cannot: Compose owns `NEO_DEPLOY_HOSTNAME` on the ingress service with a localhost fallback, and the
       * census classifies it as a required deployment input. Observing only the receipt cohort left that key
       * owned by nobody, so it refused every plane as unattributable — measured, and it made `apply`
       * unauthorizable everywhere.
       *
       * The cohort is DISCOVERED from the plane's own Compose labels rather than named here. An earlier
       * revision appended `'ingress'` as a literal, which hardcodes one profile's topology into a tool whose
       * whole point is to address a plane it did not build: a deployment with a differently-named proxy, or
       * a fourth config-bearing service, would silently fall outside the contract again.
       * @type {String[]}
       */
      CONFIG_COHORT_DISCOVERED = null;

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
              target : 'dev',
              project: null,
              profile: 'ai/deploy/docker-compose.yml',
              // The cohort whose revision receipt must move. `--services` narrows it.
              services      : DEFAULT_SERVICES,
              // The cohort whose config is observed and repaired. `null` means DISCOVER it from the plane's
              // Compose labels; `--config-services` pins it explicitly. Never a literal service name here,
              // because the plane's topology is a property of the deployment, not of this tool.
              configServices: CONFIG_COHORT_DISCOVERED,
              repoUrl       : process.env.NEO_REPO_URL || DEFAULT_REPO,
              omitted       : null,
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
            case '--services'       : options.services       = value.split(',').map(entry => entry.trim()).filter(Boolean); break;
            case '--config-services': options.configServices = value.split(',').map(entry => entry.trim()).filter(Boolean); break;

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

                // These three ARE the transaction: the pinned revision and the discovered plane identity.
                // Accepting them as repair values let a caller redirect the run to another revision or
                // another project through the same flag that repairs config — so they are refused by name
                // rather than merely losing a precedence contest.
                if (RESERVED_TRANSACTION_KEYS.has(key)) {
                    throw new Error(
                        `--set may not carry '${key}': it defines the transaction (pinned revision and ` +
                        'discovered plane identity), not the config being repaired'
                    )
                }

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
async function inspectPlane(project, services, revisionServices = services) {
    const deployedRevisions    = {},
          unchecked            = [],
          observedEnvByService = {},
          observationByService = {};

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
            observationByService[service] = {inspected: false, configRead: false};
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

        // Provenance, reported rather than discarded. These two facts are already known here and nowhere
        // else: an empty guarded set means "not measured" when the read failed and "carries no Neo config"
        // when it succeeded, and the pure core cannot tell them apart from the Map alone. Chroma is the live
        // case — inspect succeeds, guarded set is empty, and conflating the two refused every real plane.
        observationByService[service] = {inspected: true, configRead: Boolean(parsedConfig)};

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

        // Only the receipt cohort is asked for a revision. `/app/.neo-revision` is written by the Neo
        // image, so asking Caddy for one would record a permanent `null` and refuse every plane on a
        // baseline that service can never have.
        if (!revisionServices.includes(service)) {
            continue
        }

        const revision = await run('docker', ['exec', containerName, 'cat', '/app/.neo-revision']);

        deployedRevisions[service] = revision.ok && revision.stdout ? revision.stdout.split(/\s+/)[0] : null;

        if (!deployedRevisions[service]) {
            unchecked.push(`service '${service}': /app/.neo-revision unreadable (container may be stopped) — ${revision.stderr || 'no detail'}`)
        }
    }

    return {composeIdentity, deployedRevisions, unchecked, observedEnvByService, observationByService}
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
 * @summary Discovers the plane's config cohort from its own Compose service labels.
 *
 * The authority for "which services does this deployment consist of" is the deployment, not this tool. A
 * literal list would encode one profile's topology and silently exclude a differently-named proxy or a
 * fourth config-bearing service — the same class of defect as defaulting the Compose project name.
 *
 * Stopped containers count: a dead service is exactly the case this tool exists for, and omitting it would
 * drop its config from the contract at the moment it matters most.
 * @param {String} project The discovered Compose project name.
 * @returns {Promise<Object>} `{services, error}` — sorted service names, or a named failure.
 */
async function discoverConfigCohort(project) {
    const listed = await run('docker', [
        'ps', '-a', '--filter', `label=com.docker.compose.project=${project}`,
        // `.Label` and not `index .Labels`: in `docker ps` templates `.Labels` is a comma-joined STRING,
        // so indexing it errors — unlike `docker inspect`, where `.Config.Labels` is a map.
        '--format', '{{.Label "com.docker.compose.service"}}'
    ]);

    if (!listed.ok) {
        return {services: [], error: `could not list services for project '${project}': ${listed.stderr || 'no detail'}`}
    }

    const services = [...new Set(listed.stdout.split('\n').map(entry => entry.trim()).filter(Boolean))].sort();

    if (services.length === 0) {
        return {services: [], error: `project '${project}' reported no services, so no config cohort could be derived`}
    }

    return {services, error: null}
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
async function resolveServiceScopes(parity, profile, services, observedEnvByService = {}, census = null) {
    const declared      = parity?.$composeDefaultParity?.profiles?.[profile]?.services || {},
          serviceScopes = {},
          errors        = [];

    for (const service of services) {
        const template = declared[service];

        if (!template) {
            // A service with no Neo config template is COMPOSE-owned. `ingress` is Caddy, and Compose
            // declares its `NEO_DEPLOY_HOSTNAME` directly, so its obligation is what Compose sets on it —
            // read from its observed env narrowed to census-classified keys.
            //
            // Bound, stated because it is real: this cannot detect a compose-owned key Compose FORGOT to
            // set, since an absent key is simply out of scope. It holds for the keys at issue because
            // Compose supplies them with fallbacks, so absence is unreachable. The stronger source is a
            // `docker compose config` render of the discovered files, giving obligation independent of the
            // observation; that needs the plane's own compose files, whose discovered paths can live in a
            // different agent's checkout than the one running this tool.
            const observed = observedEnvByService[service];

            if (observed instanceof Map && census) {
                serviceScopes[service] = new Set([
                    ...census.requiredDeploymentInputs, ...census.optionalOverrides, ...census.secrets
                ].filter(key => observed.has(key)));

                continue
            }

            errors.push(
                `service '${service}' has no config template under $composeDefaultParity.profiles['${profile}'].services ` +
                'and no observed env to attribute from'
            );

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
 * @summary Carries forward the values a compose-owned service already has, so a repair does not revert them.
 *
 * `NEO_DEPLOY_HOSTNAME` is the worked case and the reason this exists. Compose declares it as
 * `${NEO_DEPLOY_HOSTNAME:-localhost}` on the ingress service, so it is supplied by INTERPOLATION at deploy
 * time rather than stored in the compose file. A repair run whose environment lacks it therefore re-renders
 * the fallback and silently resets a plane that had a real hostname — config loss inside a repair tool, and
 * invisible on any plane whose hostname already equals the fallback. Ours does, which is exactly why this
 * needed an assertion rather than an inspection.
 *
 * Only compose-owned services are preserved. A Neo service's config comes from its image and its own
 * declared leaves, so carrying its observed env forward would pin today's values across an upgrade that
 * intends to change them.
 * @param {Object}   options
 * @param {Object}   options.observedEnvByService Service name → observed env Map.
 * @param {String[]} options.composeOwnedServices Services with no Neo config template.
 * @param {Object}   options.census               Output of `resolveCensus`.
 * @param {Object}   [options.desiredEnv]         Operator-declared repairs, which take precedence.
 * @returns {Object} Service name → `{KEY: value}` to carry forward.
 */
export function buildPreservedEnv({observedEnvByService = {}, composeOwnedServices = [], census, desiredEnv = {}} = {}) {
    const preserved = {};

    if (!census) {
        return preserved
    }

    const classified = [...census.requiredDeploymentInputs, ...census.optionalOverrides, ...census.secrets];

    composeOwnedServices.forEach(service => {
        const observed = observedEnvByService[service];

        if (!(observed instanceof Map)) {
            return
        }

        classified.forEach(key => {
            // An operator-declared repair WINS. Preservation exists so a value the plane already carries is
            // not silently reverted, not to override an explicit fix.
            if (desiredEnv?.[service]?.[key] !== undefined || !observed.has(key)) {
                return
            }

            preserved[service] ||= {};
            preserved[service][key] = observed.get(key)
        })
    });

    return preserved
}

/**
 * @summary Renders the per-service env transition as a Compose overlay fragment, or `null` if none.
 *
 * The consumer-owned carrier. Parent environment does NOT work here and the measurement is unambiguous:
 * the profile declares its env as literals, so `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=host-edge` in the
 * pipeline's environment still renders `container-plane`, while `NEO_DEPLOY_HOSTNAME` — which the profile
 * does interpolate — renders correctly under the same command. A fragment merged in last is what the
 * containers actually consume, and it is service-scoped, so two services may carry different values for
 * one key. Found by @neo-gpt-emmy; the positive control is hers.
 * @param {Object} [desiredEnv] Service name → `{KEY: value}`; repairs and preserved values alike.
 * @returns {String|null} Fragment contents, or `null` when nothing is declared.
 */
export function buildComposeFragment(desiredEnv = {}) {
    const services = {};

    Object.entries(desiredEnv || {}).forEach(([service, entries]) => {
        const environment = {};

        Object.entries(entries || {}).forEach(([key, value]) => {
            // Compose runs `${...}` interpolation over this fragment, so an unescaped `$` is silently
            // rewritten: measured, `p@ss${x}w$1` renders as `p@ssw$1` — the operator's value replaced by a
            // different one with no error. `$$` is Compose's own escape for a literal `$`.
            environment[key] = String(value).replace(/\$/g, '$$$$')
        });

        if (Object.keys(environment).length) {
            services[service] = {environment}
        }
    });

    // JSON, not hand-written YAML: JSON is a YAML 1.2 subset, so `JSON.stringify` buys correct quoting
    // for values carrying `:`, `#`, quotes or newlines instead of a hand-rolled escaper to get wrong.
    // Verified by rendering an adversarial value through `docker compose config`.
    return Object.keys(services).length ? JSON.stringify({services}, null, 2) : null
}

/**
 * @summary Builds the exact environment handed to the pipeline — the invocation boundary, as a pure value.
 *
 * Extracted so the boundary is assertable without spawning the pipeline. Its earlier shape forwarded
 * desired values as parent environment, which does not work: the profile declares these leaves as
 * literals (`NEO_CHROMA_HOST=chroma`), not `${VAR}`, so nothing downstream consumed them. The repair now
 * travels as a Compose fragment appended in merge order, which is service-scoped by construction.
 * @param {Object}      plan            Output of `buildMigrationPlan`.
 * @param {Object}      composeIdentity `{project, configFiles}` discovered off the running plane.
 * @param {String|null} [fragmentPath]  Absolute path to the generated repair fragment, appended LAST.
 * @returns {Object} `{pipelineEnv, composeFiles}`
 */
export function buildPipelineEnv(plan, composeIdentity, fragmentPath = null) {
    // Appended last because Compose merge order decides which value wins, and the repair must override
    // the profile's literal rather than be overridden by it. This requires the pipeline to accept an
    // ORDERED list of compose files; a single-file caller cannot express a repair at all.
    const composeFiles = fragmentPath ? [...composeIdentity.configFiles, fragmentPath] : [...composeIdentity.configFiles];

    return {
        pipelineEnv: {
            NEO_REF                : plan.revisionDelta.to,
            NEO_DEPLOY_PROJECT_NAME: composeIdentity.project,
            NEO_DEPLOY_COMPOSE_FILE: composeFiles.join(path.delimiter)
        },
        composeFiles
    }
}

async function invokePipeline(plan, composeIdentity, desiredEnv = {}) {
    // The repair travels as a Compose fragment, not as parent environment. Written to a temp dir rather
    // than into the repo or the target: it is derived state for one invocation, and a stray fragment left
    // in a checkout would silently join the NEXT operator's merge order.
    const fragment = buildComposeFragment(desiredEnv);

    let fragmentPath = null;

    if (fragment) {
        const fragmentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-migrate-'));

        fragmentPath = path.join(fragmentDir, 'repair.compose.json');
        await fs.writeFile(fragmentPath, fragment)
    }

    const {pipelineEnv} = buildPipelineEnv(plan, composeIdentity, fragmentPath);

    console.log(`[migrate] invoking ${PIPELINE_REL}`);
    Object.entries(pipelineEnv).forEach(([key, value]) => console.log(`[migrate]   ${key}=${value}`));

    if (fragmentPath) {
        // KEYS only, per service. A required input's VALUE is operator-supplied config and may be a host,
        // a path or a credential-adjacent string; echoing it into a build log would persist it.
        Object.entries(desiredEnv).forEach(([service, entries]) => console.log(
            `[migrate]   repair fragment sets on '${service}': ${Object.keys(entries || {}).join(', ')}`
        ))
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
        console.error('[migrate] usage: migrateDeployment.mjs plan|apply [--target <selector>] [--project <name>] [--profile <compose-path>] [--services a,b,c] [--config-services a,b,c] [--set <service>.<KEY>=<value> ...]');
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

    // The config cohort is the plane's own service list unless the operator pinned it. Discovered, never
    // a literal, so a differently-named proxy or a fourth config-bearing service stays inside the contract.
    let configServices = options.configServices;

    if (!configServices) {
        const {services: discovered, error: cohortError} = await discoverConfigCohort(project);

        if (cohortError) {
            console.error(`[migrate] FATAL: ${cohortError}`);
            return 2
        }

        configServices = discovered;
        console.log(`[migrate] config cohort (discovered): ${configServices.join(', ')}`)
    }

    const [{composeIdentity, deployedRevisions, unchecked, observedEnvByService, observationByService}, {revision: targetRevision, error: targetError}] = await Promise.all([
        inspectPlane(project, configServices, options.services),
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

    const {serviceScopes, errors: scopeErrors} = await resolveServiceScopes(
        parity, options.profile, configServices, observedEnvByService, census
    );

    // A scope that failed to resolve is reported, never defaulted. The plan gate blocks on the missing
    // scope itself, so this only needs to carry the reason an operator would otherwise have to guess at.
    scopeErrors.forEach(message => unchecked.push(`declared-scope resolution: ${message}`));

    const plan = buildMigrationPlan({
        observedEnvByService,
        observationByService,
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

    // Preservation merged UNDER the operator's repairs: a compose-owned value the plane already carries is
    // carried forward, and an explicit --set for the same key wins. Without this, apply re-renders
    // `${NEO_DEPLOY_HOSTNAME:-localhost}` from an environment that lacks it and resets the plane's hostname.
    const composeOwned = configServices.filter(service => !(parity?.$composeDefaultParity?.profiles?.[options.profile]?.services || {})[service]),
          preserved    = buildPreservedEnv({observedEnvByService, composeOwnedServices: composeOwned, census, desiredEnv: options.desiredEnv}),
          transition   = {...preserved};

    Object.entries(options.desiredEnv).forEach(([service, entries]) => {
        transition[service] = {...(transition[service] || {}), ...entries}
    });

    const pipelineCode = await invokePipeline(plan, composeIdentity, transition);

    if (pipelineCode !== 0) {
        console.error(`[migrate] FATAL: pipeline exited ${pipelineCode}; the transition did not complete.`);
        return pipelineCode
    }

    // The pipeline's success means the containers are HEALTHY, not that they carry the target code.
    // A health-gated recreate proves the containers are up, not that they carry the target code. So the
    // revision is re-read per service and compared to the pin.
    console.log('');
    console.log('[migrate] verifying /app/.neo-revision moved on every service...');

    const after   = await inspectPlane(project, configServices, options.services),
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
