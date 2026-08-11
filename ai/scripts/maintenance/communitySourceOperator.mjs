/**
 * @plane in-plane
 */
// Neo namespace bootstrap (entry-point invariant) — co-located community source control plane.
import 'dotenv/config';
import {Command}             from 'commander';
import Neo                   from '../../../src/Neo.mjs';
import * as core             from '../../../src/core/_export.mjs';
import fs                    from 'fs';
import os                    from 'os';
import {pathToFileURL}       from 'url';
import SourceRegistryService from '../../services/memory-core/SourceRegistryService.mjs';

/**
 * @module ai/scripts/maintenance/communitySourceOperator
 * @summary Co-located deployment-operator CLI for audited community source lifecycle control.
 */

/**
 * @summary Parses one operator invocation.
 * @param {String[]} argv
 * @param {Object} env
 * @returns {Object}
 */
function parseArgs(argv, env = process.env) {
    const program    = new Command();
    let   parseError = null;

    program
        .name('community-source-operator')
        .exitOverride()
        .configureOutput({writeErr: () => {}, writeOut: () => {}})
        .allowExcessArguments(false)
        .option('--action <action>', 'register, provision, activate, revoke, or audit')
        .option('--expected-epoch <epoch>', 'Observed registration epoch for lifecycle CAS')
        .option('--expected-state <state>', 'Observed lifecycle state for lifecycle CAS')
        .option('--source-file <path>', 'Credential-free neutral registration JSON for register')
        .option('--source-instance-id <id>', 'Server-minted source id for transition or audit')
        .option('--tenant-id <tenantId>', 'Deployment-owned tenant key');

    try {
        program.parse(argv, {from: 'user'})
    } catch (error) {
        parseError = error.message
    }

    const options = program.opts(),
          args    = {
              action          : options.action || null,
              actorId         : env.NEO_COMMUNITY_OPERATOR_ID || `os-user:${os.userInfo().username}`,
              expectedEpoch   : options.expectedEpoch === undefined ? null : Number(options.expectedEpoch),
              expectedState   : options.expectedState || null,
              sourceFile      : options.sourceFile || null,
              sourceInstanceId: options.sourceInstanceId || null,
              tenantId        : options.tenantId || null
          };

    if (parseError) args.parseError = parseError;

    return args
}

/**
 * @summary Validates operator argv before opening Memory Core storage.
 * @param {Object} args
 * @returns {String[]}
 */
function validateArgs(args) {
    if (args.parseError) return [args.parseError];

    const errors      = [],
          transitions = new Set(['provision', 'activate', 'revoke']);

    if (!['register', ...transitions, 'audit'].includes(args.action)) {
        errors.push('--action must be register, provision, activate, revoke, or audit.')
    }
    if (!args.tenantId) errors.push('--tenant-id is required.');
    if (args.action === 'register') {
        if (!args.sourceFile) errors.push('--source-file is required for register.');
        if (args.sourceFile && !fs.existsSync(args.sourceFile)) errors.push(`--source-file path does not exist: ${args.sourceFile}`)
    }
    if (transitions.has(args.action)) {
        if (!args.sourceInstanceId) errors.push('--source-instance-id is required for lifecycle transitions.');
        if (!args.expectedState) errors.push('--expected-state is required for lifecycle transitions.');
        if (!Number.isInteger(args.expectedEpoch)) errors.push('--expected-epoch must be an integer for lifecycle transitions.')
    }
    if (args.action === 'audit' && !args.sourceInstanceId) {
        errors.push('--source-instance-id is required for audit.')
    }

    return errors
}

/**
 * @summary Executes one co-located operator action against the registry owner.
 * @param {Object} options
 * @param {Object} options.args
 * @param {Object} [options.registry]
 * @returns {Promise<Object|Object[]>}
 */
async function runOperator({args, registry = SourceRegistryService}) {
    await registry.ready?.();

    if (args.action === 'register') {
        const data = JSON.parse(fs.readFileSync(args.sourceFile, 'utf8'));

        return registry.registerForTenant(args.tenantId, data, {actorId: args.actorId})
    }

    if (args.action === 'audit') {
        return registry.listAuditForTenant(args.tenantId, args.sourceInstanceId)
    }

    const toState = {
        provision: 'PROVISIONED',
        activate : 'ACTIVE',
        revoke   : 'REVOKED'
    }[args.action];

    return registry.transitionLifecycleForTenant(args.tenantId, args.sourceInstanceId, toState, {
        actorId      : args.actorId,
        expectedState: args.expectedState,
        expectedEpoch: args.expectedEpoch
    })
}

/**
 * @summary CLI entry point.
 * @returns {Promise<void>}
 */
async function communitySourceOperator() {
    const args   = parseArgs(process.argv.slice(2)),
          errors = validateArgs(args);

    if (errors.length) {
        errors.forEach(error => console.error(`Error: ${error}`));
        process.exit(1)
    }

    try {
        console.log(JSON.stringify(await runOperator({args}), null, 2));
        process.exit(0)
    } catch (error) {
        console.error('Community source operator failed:', error.message);
        process.exit(1)
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    communitySourceOperator()
}

export {parseArgs, runOperator, validateArgs};
