import dotenv from 'dotenv';
dotenv.config();

import http         from 'http';
import app          from './app.mjs';
import serverConfig from './config.mjs';

const { host, port } = serverConfig;
const server = http.createServer(app);

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        // eslint-disable-next-line no-console
        console.error(`[GitHub Workflow MCP] Error: Port ${port} is already in use.`);
        process.exit(1);
    }
});

server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[GitHub Workflow MCP] Server listening on http://${host}:${port}`);
});

