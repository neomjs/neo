import {readFileSync}                       from 'node:fs';
import {callJsonTool, createIdentityClient} from '../../integration/fixtures/mcpClient.mjs';

/**
 * @summary In-container probe for the parity lane's network-dependent assertions.
 *
 * The CI overlay marks the parity network `internal`, so no host-published ports exist
 * to probe from the runner — by construction, which is also what makes the
 * wrong-process-on-a-host-port class (the profile's 8100 ssh-collision lesson)
 * inexpressible in CI. The specs therefore exec THIS script inside a service container
 * and assert on its output: provider/mock inspection (`providers`) and the end-to-end
 * embedding round trip (`recall`). It runs against loopback or compose DNS from inside
 * the network, never against a host port.
 *
 * Usage: `node test/playwright/integration-parity/fixtures/parityProbe.mjs <providers|recall> <baseUrl>`
 */

const [action, baseUrl] = process.argv.slice(2);
const bearerTokenFile   = process.env.NEO_MCP_HEALTHCHECK_TOKEN_FILE;

if (!bearerTokenFile) {
    throw new Error('parityProbe requires NEO_MCP_HEALTHCHECK_TOKEN_FILE')
}

const bearerToken = readFileSync(bearerTokenFile, 'utf8').trim();

if (!bearerToken) {
    throw new Error(`parityProbe bearer-token file is empty: ${bearerTokenFile}`)
}

if (action === 'providers') {
    const client = await createIdentityClient({
        baseUrl,
        bearerToken,
        clientName: 'neo-parity-ci-probe'
    });

    try {
        const health = await callJsonTool(client, 'healthcheck');

        console.log(JSON.stringify({embedding: health.providers?.embedding, features: health.features}))
    } finally {
        await client.close()
    }
} else if (action === 'recall') {
    const token  = `parity-ci-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const client = await createIdentityClient({
        baseUrl,
        bearerToken,
        clientName: 'neo-parity-ci-spec-memory'
    });

    try {
        await callJsonTool(client, 'add_memory', {
            prompt  : `Parity CI probe prompt ${token}`,
            thought : `Parity CI probe thought ${token}`,
            response: `Parity CI probe response ${token}`
        });

        let   found    = false;
        const deadline = Date.now() + 30000;

        while (!found && Date.now() < deadline) {
            const result = await callJsonTool(client, 'query_raw_memories', {query: token, nResults: 5});

            found = JSON.stringify(result).includes(token);

            if (!found) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!found) {
            console.error(`RECALL-FAILED: semantic recall never surfaced the probe memory (token=${token}) — the embedding path (mock provider, WAL drain, chroma write) is broken`);
            process.exit(1);
        }

        console.log('RECALL-OK');
    } finally {
        await client.close();
    }
} else {
    console.error(`parityProbe: unknown action "${action}" — expected providers|recall`);
    process.exit(2);
}
