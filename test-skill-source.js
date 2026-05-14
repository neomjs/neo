import './src/core/Neo.mjs';
import SkillSource from './ai/services/knowledge-base/source/SkillSource.mjs';
import crypto from 'crypto';

class DummyWriteStream {
    write(str) {
        console.log(JSON.parse(str));
    }
}

const createHashFn = (chunk) => crypto.createHash('md5').update(JSON.stringify(chunk)).digest('hex');

async function test() {
    const source = Neo.create(SkillSource);
    const stream = new DummyWriteStream();
    
    // Patch fg to just return one file to avoid spam
    const originalFg = require('fast-glob');
    
    const count = await source.extract(stream, createHashFn);
    console.log(`Extracted ${count} chunks.`);
}

test().catch(console.error);
