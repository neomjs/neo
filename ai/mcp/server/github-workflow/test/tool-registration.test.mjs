import fs from 'fs';
import path from 'path';

const f = path.resolve('ai/mcp/server/github-workflow/services/toolService.mjs');
if (!fs.existsSync(f)) {
  console.error('toolService.mjs not found at', f);
  process.exit(2);
}
const s = fs.readFileSync(f, 'utf8');

// Try to extract the serviceMapping block roughly and detect keys
const m = s.match(/serviceMapping\s*=\s*\{([\s\S]*?)\};?/m);
if (!m) {
  console.error('serviceMapping block not found in toolService.mjs');
  process.exit(3);
}
const body = m[1];
const keys = [...body.matchAll(/(?:['\"])?([a-zA-Z0-9_]+)(?:['\"])?\s*:/g)].map(x=>x[1]);
if (keys.includes('list_issues')) {
  console.log('OK: list_issues registered in toolService');
  process.exit(0);
} else {
  console.error('FAIL: list_issues not found in toolService mapping. Keys found:', keys.join(', '));
  process.exit(1);
}
