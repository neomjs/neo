import path                                       from 'path';
import {fileURLToPath}                            from 'url';
import BaseConfig, {createConfigProxy}            from '../../../BaseConfig.mjs';
import Env from '../../../../src/util/Env.mjs';

const __filename     = fileURLToPath(import.meta.url);
const __dirname      = path.dirname(__filename);
const packageRoot    = path.resolve(__dirname, '../../../../');
const projectRoot    = process.cwd() === '/' ? packageRoot : process.cwd();
const validLogLevels = ['error', 'warn', 'info', 'log', 'debug'];

/**
 * @summary Parses a GitLab Workflow MCP log level from environment input.
 * @param {String} rawValue
 * @param {String} envVarName
 * @param {Function} [warn=console.warn]
 * @returns {String|undefined}
 */
function parseLogLevel(envVarName, {env = process.env, warn = console.warn} = {}) {
    const rawValue = env[envVarName];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;
    const value = String(rawValue).trim().toLowerCase();

    if (validLogLevels.includes(value)) {
        return value;
    }

    warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be one of: ${validLogLevels.join(', ')}); falling back.`);
    return undefined;
}

/**
 * @summary GitLab Workflow MCP configuration singleton.
 *
 * @class Neo.ai.mcp.server.gitlab-workflow.Config
 * @extends Neo.ai.BaseConfig
 */
class Config extends BaseConfig {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.gitlab-workflow.Config'
         * @protected
         */
        className: 'Neo.ai.mcp.server.gitlab-workflow.Config',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @summary Meta-leaf configuration for the GitLab Workflow MCP server scaffold.
         *
         * Keeps client-project GitLab host / PAT configuration out of tracked files.
         * The real GitLabClient subtask consumes the same keys when API calls land.
         * @member {Object} metaTree
         */
        metaTree: {
            /**
             * @member {String} projectRoot
             */
            projectRoot: {default: projectRoot},
            /**
             * @member {Boolean} debug=false
             */
            debug: {env: 'NEO_GITLAB_WORKFLOW_DEBUG', default: false, parse: Env.parseBool},
            /**
             * @member {String} logLevel='warn'
             */
            logLevel: {env: 'NEO_GITLAB_WORKFLOW_LOG_LEVEL', default: 'warn', parse: parseLogLevel},
            /**
             * @summary Shared MCP logger policy for GitLab Workflow.
             *
             * Priority-filtered stderr only. `debug: true` promotes the default `warn`
             * threshold to `debug`; no file sink is used for this workflow server.
             * @member {Object} logger
             */
            logger: {default: {
                defaultLevel: 'warn',
                fileSink    : false,
                stderrMode  : 'threshold'
            }},
            /**
             * @member {String} transport='stdio'
             */
            transport: {env: 'NEO_GITLAB_WORKFLOW_TRANSPORT', default: 'stdio', parse: Env.parseString},
            /**
             * @member {Object} gitlab
             */
            gitlab: {
                /**
                 * GitLab instance base URL.
                 * @member {String} hostUrl='https://gitlab.com'
                 */
                hostUrl: {env: 'NEO_GITLAB_HOST', default: 'https://gitlab.com', parse: Env.parseUrl},
                /**
                 * GitLab Personal Access Token. Empty in the tracked template.
                 * @member {String} token=''
                 */
                token: {env: 'NEO_GITLAB_PAT', default: '', parse: Env.parseString}
            }
        }
    }
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
