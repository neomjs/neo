import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

/**
 * @module buildScripts/ai/initServerConfigs
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const cwd        = path.resolve(__dirname, '../../'); // Neo root
const serversDir = path.join(cwd, 'ai', 'mcp', 'server');

/**
 * Iterates over each MCP server and ensures its config.mjs exists.
 * If not, it clones the respective config.template.mjs.
 */
async function initConfigs() {
    console.log('[Neo AI] Checking MCP Server configurations...');

    // Check if the server root exists
    if (!fs.existsSync(serversDir)) {
        console.warn('[Neo AI] MCP Server directory not found, skipping config initialization.');
        return;
    }

    const servers = await fs.readdir(serversDir);

    for (const serverName of servers) {
        const serverPath = path.join(serversDir, serverName);

        // Skip files, only check directories
        const stat = await fs.stat(serverPath);
        if (!stat.isDirectory()) continue;

        const templatePath = path.join(serverPath, 'config.template.mjs');
        const activePath   = path.join(serverPath, 'config.mjs');

        // Only act if there is a template available
        if (fs.existsSync(templatePath)) {
            if (!fs.existsSync(activePath)) {
                console.log(`[Neo AI] Config missing for MCP server '${serverName}'. Cloning from template...`);
                await fs.copy(templatePath, activePath);
            }
        }
    }
}

initConfigs().catch(err => {
    console.error('[Neo AI] Failed to initialize server configs:', err);
    process.exit(1);
});
