import path from 'path';
import { fileURLToPath } from 'url';

// Make sure Neo is globally available
import '../src/neo.mjs';
import Config from './config.template.mjs';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
    console.log('Testing Tier 1 Immutability Invariant...');

    const initialPort = Config.mcpHttpPort;
    
    // Modify through the singleton instance
    Config.data.mcpHttpPort = 9999;
    assert.strictEqual(Config.mcpHttpPort, 9999, 'Config instance should reflect modification.');

    // Re-run construct to re-clone from defaultConfig using the unwrapped instance
    Neo.ns('Neo.ai.Config').construct({});
    
    assert.notStrictEqual(Neo.ns('Neo.ai.Config').data.mcpHttpPort, 9999, 'Re-cloned instance should not inherit the mutated port.');
    assert.strictEqual(Neo.ns('Neo.ai.Config').data.mcpHttpPort, initialPort, 'Re-cloned instance should have the original port.');
    
    console.log('✅ Tier 1 immutability invariant verified. defaultConfig is safe.');
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
