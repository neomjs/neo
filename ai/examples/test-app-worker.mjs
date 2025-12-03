import { AppWorker_BridgeService } from '../services.mjs';

/**
 * Test script for the App Worker MCP Server.
 * Verifies that the Node.js agent can talk to the browser app.
 */
async function main() {
    console.log('🧪 Testing App Worker Neural Link...');

    // 1. Start the Bridge
    console.log('[1] Starting Bridge Service...');
    // Accessing the singleton instance starts the server
    const bridge = AppWorker_BridgeService;

    // Wait a moment for server to bind
    await new Promise(resolve => setTimeout(resolve, 1000));

    const status = bridge.getStatus();
    console.log(`   ✅ Bridge listening on port ${bridge.port}`);
    console.log(`   Clients connected: ${status.connectedClients}`);

    if (status.connectedClients === 0) {
        console.log('   ⚠️  No App Worker connected yet. Please reload the browser window.');
        console.log('   Waiting for connection...');

        // Poll for connection
        let retries = 30;
        while (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bridge.getStatus().connectedClients > 0) break;
            process.stdout.write('.');
            retries--;
        }
        console.log('');
    }

    if (bridge.getStatus().connectedClients === 0) {
        console.error('❌ Timeout: App Worker did not connect.');
        process.exit(1);
    }

    console.log('   ✅ App Worker Connected!');

    // 2. Send Remote Command
    console.log('[2] Sending Remote Command (createNeoInstance)...');

    try {
        const result = await bridge.evaluate({
            method: 'Neo.worker.App.createNeoInstance',
            params: [{
                ntype: 'button',
                text: 'Hello from Node.js!',
                iconCls: 'fa fa-robot',
                style: {
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    zIndex: 1000
                }
            }]
        });

        console.log('   ✅ Command Sent. Result:', result);
        console.log('   (Check browser to see the new button!)');

    } catch (error) {
        console.error('   ❌ Command Failed:', error);
    }

    // Keep process alive briefly to ensure message flush
    setTimeout(() => process.exit(0), 1000);
}

main();
