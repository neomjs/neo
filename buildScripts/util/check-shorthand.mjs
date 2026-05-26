import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}        from 'node:fs';
import path                  from 'node:path';
import process               from 'node:process';
import {fileURLToPath}       from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

let gitRoot;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
} catch (e) {
    console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
    process.exit(1);
}

if (path.resolve(scriptRoot) !== path.resolve(gitRoot)) {
    console.error('\x1b[31mError: Script repository root mismatch.\x1b[0m');
    console.error(`check-shorthand.mjs is located under '${scriptRoot}', but the git repository root is '${gitRoot}'.`);
    process.exit(1);
}

const shorthandRegex = /^(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*\2\s*[,}]/;
const defaultDirs    = ['ai', 'src', 'test/playwright'];

function collectDefaultFiles() {
    const args = ['-type', 'f', '-name', '*.mjs',
        '-not', '-path', '*/.claude/*',
        '-not', '-path', '*/.codex/*',
        '-not', '-path', '*/dist/*',
        '-not', '-path', '*/node_modules/*'
    ];
    const result = spawnSync('find', [...defaultDirs, ...args], {cwd: gitRoot, encoding: 'utf-8'});
    if (result.status !== 0) {
        console.error('\x1b[31mError: find command failed.\x1b[0m');
        console.error(result.stderr);
        process.exit(1);
    }
    return result.stdout.trim().split('\n').filter(Boolean);
}

const argvFiles = process.argv.slice(2);
const files     = argvFiles.length > 0
    ? argvFiles.filter(f => f.endsWith('.mjs'))
    : collectDefaultFiles();

if (files.length === 0) {
    console.log('check-shorthand: 0 .mjs files in scope, nothing to check.');
    process.exit(0);
}

const violations = [];
for (const file of files) {
    let content;
    try {
        content = readFileSync(file, 'utf-8');
    } catch (e) {
        console.error(`check-shorthand: could not read ${file}: ${e.message}`);
        continue;
    }
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (shorthandRegex.test(line)) {
            violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
    });
}

if (violations.length > 0) {
    console.error(`\x1b[31mcheck-shorthand: ${violations.length} verbose key:key form(s) found:\x1b[0m`);
    violations.forEach(v => console.error('  ' + v));
    console.error('\nUse ES2015 shorthand: {key} instead of {key: key}.');
    process.exit(1);
}

console.log(`check-shorthand: ${files.length} files scanned, 0 violations.`);
