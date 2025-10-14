import dotenv from 'dotenv';
dotenv.config();

import app          from './app.mjs';
import serverConfig from './config.mjs';

const {host, port} = serverConfig;

app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[GitHub Workflow MCP] Server listening on http://${host}:${port}`);
});
