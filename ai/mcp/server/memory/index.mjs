import app          from './app.mjs';
import serverConfig from './config.mjs';

const {host, port} = serverConfig;

app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[Memory MCP] Server listening on http://${host}:${port}`);
});
