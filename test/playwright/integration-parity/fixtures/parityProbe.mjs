import {callHealthcheck, callJsonTool, createIdentityClient} from '../../integration/fixtures/mcpClient.mjs';

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

if (action === 'providers') {
    const health = await callHealthcheck(baseUrl, {clientName: 'neo-parity-ci-probe'});

    console.log(JSON.stringify({embedding: health.providers?.embedding, features: health.features}));
} else if (action === 'recall') {
    const token  = `parity-ci-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const client = await createIdentityClient({baseUrl, clientName: 'neo-parity-ci-spec-memory', identity: 'neo-parity-ci-spec'});

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
