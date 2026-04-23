import fs from 'fs';
const out = fs.readFileSync('test/playwright/unit/ai/mcp/server/memory-core/services/GraphService.spec.mjs', 'utf8');
console.log(out.includes('geminiPro node is:'));
