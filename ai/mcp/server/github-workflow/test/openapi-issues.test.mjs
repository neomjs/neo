import fs from 'fs';
import path from 'path';

const f = path.resolve('ai/mcp/server/github-workflow/openapi.yaml');
if (!fs.existsSync(f)) {
  console.error('openapi.yaml not found at', f);
  process.exit(2);
}
const s = fs.readFileSync(f, 'utf8');

const hasPath = /(^|\n)\s*\/issues\s*:/m.test(s) || /\/issues\b/.test(s);
const hasSchema = /IssueListResponse\b/.test(s) || /components:[\s\S]*IssueListResponse/m.test(s);

if (hasPath && hasSchema) {
  console.log('OK: openapi.yaml contains /issues path and IssueListResponse schema');
  process.exit(0);
} else {
  console.error('FAIL: openapi.yaml missing /issues path or IssueListResponse schema');
  if (!hasPath) console.error('- /issues path not found');
  if (!hasSchema) console.error('- IssueListResponse schema not found');
  process.exit(1);
}
