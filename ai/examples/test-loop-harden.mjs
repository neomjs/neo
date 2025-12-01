import Neo          from '../../src/Neo.mjs';
import * as core    from '../../src/core/_export.mjs';
import Loop         from '../agent/Loop.mjs';
import Scheduler    from '../agent/Scheduler.mjs';
import Assembler    from '../context/Assembler.mjs';
import BaseProvider from '../provider/Base.mjs';

// --- Mock Provider ---
class MockProvider extends BaseProvider {
    static config = { className: 'MockProvider' }

    shouldFail = true;
    failCount = 0;

    async generate(messages) {
        if (this.shouldFail && this.failCount < 2) {
            this.failCount++;
            throw new Error('Simulated API Error');
        }
        return { content: 'Success after retry' };
    }
}
MockProvider = Neo.setupClass(MockProvider);

// --- Mock Assembler ---
class MockAssembler extends Assembler {
    static config = { className: 'MockAssembler' }
    async assemble() { return { system: 'sys', messages: [] }; }
}
MockAssembler = Neo.setupClass(MockAssembler);

// --- Test Runner ---
async function runTests() {
    console.log('🧪 Testing Loop Hardening...');

    // 1. Test Context Compression
    console.log('\n[Test 1] Context Compression');
    const assembler = Neo.create(Assembler);
    // Create 30 memories
    const memories = Array.from({length: 30}, (_, i) => ({
        prompt: `Msg ${i}`,
        thought: '...',
        response: `Resp ${i}`
    }));

    const formatted = assembler.formatHistory(memories);

    // Expect: 5 (context) + 1 (summary) + 10 (recent) = 16 items * 2 messages each?
    // Wait, formatMessages returns [user, model] per memory.
    // So 1 memory = 2 messages.
    // Input 30 memories = 60 messages.
    // Compressed:
    // Context (5 mems) = 10 msgs
    // Summary = 1 msg
    // Recent (10 mems) = 20 msgs
    // Total = 31 messages.

    console.log(`Input Memories: ${memories.length}`);
    console.log(`Formatted Messages: ${formatted.length}`);
    
    const middleItem = formatted[10];

    if (formatted.length === 31 && middleItem.content.includes('summarized')) {
        console.log('✅ Compression Logic: PASS');
    } else {
        console.error('❌ Compression Logic: FAIL');
        console.log('Length:', formatted.length);
        console.log('Middle item:', middleItem);
        console.log('Includes "summarized":', middleItem?.content?.includes('summarized'));
    }

    // 2. Test Error Recovery
    console.log('\n[Test 2] Error Recovery (Retry)');
    const scheduler = Neo.create(Scheduler);
    const provider = Neo.create(MockProvider);
    const loop = Neo.create(Loop, {
        scheduler,
        provider,
        assembler: Neo.create(MockAssembler),
        interval: 50 // fast tick
    });

    loop.start();

    scheduler.add({ type: 'test:retry', data: 'foo' });

    // Wait for retries
    // Tick 1: Fails (1/3)
    // Backoff 1s
    // Tick 2: Fails (2/3)
    // Backoff 2s
    // Tick 3: Success

    // We need to wait enough time
    console.log('Waiting for retries...');

    await new Promise(r => setTimeout(r, 4000));

    if (provider.failCount === 2) {
         console.log('✅ Retry Logic: PASS (Retried 2 times then succeeded)');
    } else {
         console.error(`❌ Retry Logic: FAIL (Fail count: ${provider.failCount})`);
    }

    loop.stop();
    process.exit(0);
}

runTests();
