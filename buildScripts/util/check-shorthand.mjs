import {program}            from 'commander';
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

const DEFAULT_DIRS    = ['ai', 'src', 'test/playwright'];
const DEFAULT_IGNORES = ['.claude', '.codex', 'dist', 'node_modules'];
const SHORTHAND_RE    = /^(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*\2\s*[,}]/;

program
    .name('check-shorthand')
    .description('Substrate gate against `key: key` verbose-form regression in .mjs files.')
    .argument('[files...]', 'Specific .mjs files to scan (lint-staged passes staged paths here). When omitted, falls back to scanning --dirs.')
    .option('-d, --dirs <list>', 'Comma-separated directories to scan in default mode.', DEFAULT_DIRS.join(','))
    .option('-i, --ignore <list>', 'Comma-separated path fragments to exclude from default-mode scan.', DEFAULT_IGNORES.join(','))
    .option('-q, --quiet', 'Suppress the per-violation listing; print summary only.', false)
    .showHelpAfterError();

program.parse(process.argv);

const argvFiles = program.args;
const options   = program.opts();
const scanDirs  = options.dirs.split(',').map(s => s.trim()).filter(Boolean);
const ignores   = options.ignore.split(',').map(s => s.trim()).filter(Boolean);

function collectDefaultFiles() {
    const findArgs = ['-type', 'f', '-name', '*.mjs'];
    ignores.forEach(ignore => findArgs.push('-not', '-path', `*/${ignore}/*`));

    const result = spawnSync('find', [...scanDirs, ...findArgs], {cwd: gitRoot, encoding: 'utf-8'});
    if (result.status !== 0) {
        console.error('\x1b[31mError: find command failed.\x1b[0m');
        console.error(result.stderr);
        process.exit(1);
    }
    return result.stdout.trim().split('\n').filter(Boolean);
}

const files = argvFiles.length > 0
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
        if (SHORTHAND_RE.test(line)) {
            violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
    });
}

if (violations.length > 0) {
    console.error(`\x1b[31mcheck-shorthand: ${violations.length} verbose key:key form(s) found:\x1b[0m`);
    if (!options.quiet) {
        violations.forEach(v => console.error('  ' + v));
        console.error('\nUse ES2015 shorthand: {key} instead of {key: key}.');
    }
    process.exit(1);
}

console.log(`check-shorthand: ${files.length} files scanned, 0 violations.`);
