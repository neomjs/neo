import path                   from 'path';
import {fileURLToPath}        from 'url';
import ConfigProvider, {leaf} from '../../../ConfigProvider.mjs';

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
 * @summary Extendable defaults and formulas for the GitLab Workflow MCP server.
 *
 * @class Neo.ai.mcp.server.gitlab-workflow.ConfigBase
 * @extends Neo.ai.ConfigProvider
 */
class ConfigBase extends ConfigProvider {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.gitlab-workflow.ConfigBase'
         * @protected
         */
        className: 'Neo.ai.mcp.server.gitlab-workflow.ConfigBase',
        /**
         * @summary Meta-leaf configuration for the GitLab Workflow MCP server scaffold.
         *
         * Keeps client-project GitLab host / PAT configuration out of tracked files.
         * The real GitLabClient subtask consumes the same keys when API calls land.
         * @member {Object} data
         */
        data: {
            /**
             * @member {String} projectRoot
             */
            projectRoot: leaf(projectRoot),
            /**
             * @member {Boolean} debug=false
             */
            debug: leaf(false, 'NEO_GITLAB_WORKFLOW_DEBUG', 'boolean'),
            /**
             * @member {String} logLevel='warn'
             */
            logLevel: leaf('warn', 'NEO_GITLAB_WORKFLOW_LOG_LEVEL', 'string', {parse: parseLogLevel}),
            /**
             * @summary Shared MCP logger policy for GitLab Workflow.
             *
             * Priority-filtered stderr only. `debug: true` promotes the default `warn`
             * threshold to `debug`; no file sink is used for this workflow server.
             * @member {Object} logger
             */
            logger: leaf({
                defaultLevel: 'warn',
                fileSink    : false,
                stderrMode  : 'threshold'
            }),
            /**
             * Server transport protocol. Supported values are exactly `stdio` and `streamable-http`.
             * @member {String} transport='stdio'
             */
            transport: leaf('stdio', 'NEO_GITLAB_WORKFLOW_TRANSPORT', 'string'),
            /**
             * @member {Object} gitlab
             */
            gitlab: {
                /**
                 * GitLab instance base URL.
                 * @member {String} hostUrl='https://gitlab.com'
                 */
                hostUrl: leaf('https://gitlab.com', 'NEO_GITLAB_HOST', 'url'),
                /**
                 * GitLab Personal Access Token. Empty in the tracked template.
                 * @member {String} token=''
                 */
                token: leaf('', 'NEO_GITLAB_PAT', 'string'),
                /**
                 * Default GitLab project full path (e.g. `group/subgroup/project`) for issue / MR
                 * operations — analogous to github-workflow's owner/repo. The leaf owns env-default
                 * resolution; services read the resolved `aiConfig.gitlab.projectPath` at the use site.
                 * @member {String} projectPath=''
                 */
                projectPath: leaf('', 'NEO_GITLAB_PROJECT', 'string')
            }
        }
    }
}

export default Neo.setupClass(ConfigBase);
