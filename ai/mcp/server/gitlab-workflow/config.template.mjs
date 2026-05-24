import path                                       from 'path';
import {fileURLToPath}                            from 'url';
import BaseConfig, {createConfigProxy}            from '../shared/BaseConfig.mjs';
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
function parseLogLevel(rawValue, envVarName, warn = console.warn) {
    const value = String(rawValue).trim().toLowerCase();

    if (validLogLevels.includes(value)) {
        return value;
    }

    warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be one of: ${validLogLevels.join(', ')}); falling back.`);
    return undefined;
}

/**
 * @summary Default configuration for the GitLab Workflow MCP server scaffold.
 *
 * Keeps client-project GitLab host / PAT configuration out of tracked files.
 * The real GitLabClient subtask consumes the same keys when API calls land.
 */
const defaultConfig = {
    /**
     * @member {String} projectRoot
     */
    projectRoot,
    /**
     * @member {Boolean} debug=false
     */
    debug: false,
    /**
     * @member {String} logLevel='warn'
     */
    logLevel: 'warn',
    /**
     * @member {String} transport='stdio'
     */
    transport: 'stdio',
    /**
     * @member {Object} gitlab
     */
    gitlab: {
        /**
         * GitLab instance base URL.
         * @member {String} hostUrl='https://gitlab.com'
         */
        hostUrl: 'https://gitlab.com',
        /**
         * GitLab Personal Access Token. Empty in the tracked template.
         * @member {String} token=''
         */
        token: ''
    }
};

/**
 * @summary Environment-variable ledger for client-project GitLab MCP config.
 */
const envBindings = {
    debug           : {var: 'NEO_GITLAB_WORKFLOW_DEBUG', parse: Env.parseBool},
    logLevel        : {var: 'NEO_GITLAB_WORKFLOW_LOG_LEVEL', parse: parseLogLevel},
    transport       : {var: 'NEO_GITLAB_WORKFLOW_TRANSPORT', parse: Env.parseString},
    'gitlab.hostUrl': {var: 'NEO_GITLAB_HOST', parse: Env.parseUrl},
    'gitlab.token'  : {var: 'NEO_GITLAB_PAT', parse: Env.parseString}
};

/**
 * @summary GitLab Workflow MCP configuration singleton.
 *
 * @class Neo.ai.mcp.server.gitlab-workflow.Config
 * @extends Neo.ai.mcp.server.shared.BaseConfig
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
        singleton: true
    }

    defaultConfig = defaultConfig
    envBindings   = envBindings
}

const instance = Neo.setupClass(Config);

export default createConfigProxy(instance);
