#!/usr/bin/env node
/**
 * @summary Lints the Neo.mjs skill capability manifest.
 *
 * `SKILL.md` frontmatter stays runtime-canonical. The manifest mirrors that
 * data for CI and governance checks; this script enforces one-way consistency
 * plus local substrate-budget and harness-symlink invariants.
 */
import fs from 'fs/promises';
import {existsSync, lstatSync, readFileSync, readlinkSync, statSync} from 'fs';
import path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

const __filename    = fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
const ROOT_DIR      = path.resolve(__dirname, '../../..');
const SKILLS_DIR    = path.join(ROOT_DIR, '.agents/skills');
const CLAUDE_DIR    = path.join(ROOT_DIR, '.claude/skills');
const MANIFEST_PATH = path.join(SKILLS_DIR, 'skills.manifest.json');
const SCHEMA_PATH   = path.join(SKILLS_DIR, 'skills.manifest.schema.json');
const REPORT_TOP_N  = 15;

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        base       : null,
        reportSizes: false,
        top        : REPORT_TOP_N
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--base') {
            options.base = argv[++i];
        } else if (arg.startsWith('--base=')) {
            options.base = arg.slice('--base='.length);
        } else if (arg === '--report-sizes') {
            options.reportSizes = true;
        } else if (arg === '--top') {
            options.top = parseTopArg(argv[++i]);
        } else if (arg.startsWith('--top=')) {
            options.top = parseTopArg(arg.slice('--top='.length));
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function parseTopArg(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`--top must be a positive integer, got: ${value}`);
    }

    return parsed;
}

function readJson(filePath) {
    return JSON.parse(requireText(filePath));
}

function requireText(filePath) {
    return readFileSync(filePath, 'utf8');
}

function parseFrontmatter(text, filePath) {
    const match = text.match(/^---\n([\s\S]*?)\n---/);

    if (!match) {
        throw new Error(`${filePath} missing YAML frontmatter block`);
    }

    const data = {};

    for (const line of match[1].split('\n')) {
        if (!line.trim()) continue;

        const index = line.indexOf(':');

        if (index === -1) {
            throw new Error(`${filePath} has malformed frontmatter line: ${line}`);
        }

        const key   = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();

        let parsedValue = value.replace(/^"(.*)"$/, '$1');
        if (value !== parsedValue) {
            parsedValue = parsedValue.replace(/\\"/g, '"');
        }
        data[key] = parsedValue;
    }

    for (const key of ['name', 'description']) {
        if (!data[key]) {
            throw new Error(`${filePath} missing required frontmatter key: ${key}`);
        }
    }

    return data;
}

async function listSkillDirs() {
    const entries = await fs.readdir(SKILLS_DIR, {withFileTypes: true});

    return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
}

async function walkFiles(dir) {
    if (!existsSync(dir)) return [];

    const entries = await fs.readdir(dir, {withFileTypes: true});
    const files   = [];

    for (const entry of entries) {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...await walkFiles(filePath));
        } else {
            files.push(filePath);
        }
    }

    return files;
}

function countMatches(text, regex) {
    return (text.match(regex) || []).length;
}

function classifySizeReportRow(row) {
    if (row.file.endsWith('/SKILL.md')) return 'keep';
    if (row.bytes > 30000 || row.signals > 150) return 'compress-to-trigger';
    if (row.lineRefs > 0 || row.history > 50) return 'rewrite';
    if (row.file.includes('/audits/') && row.bytes > 10000) return 'move';

    return 'keep';
}

async function skillMarkdownSizeReport({top = REPORT_TOP_N} = {}) {
    const files = (await walkFiles(SKILLS_DIR))
        .filter(file => file.endsWith('.md'))
        .sort();

    const rows = files.map(filePath => {
        const text    = requireText(filePath);
        const bytes   = Buffer.byteLength(text, 'utf8');
        const lines   = text.split('\n').length;
        const headings = countMatches(text, /^#{1,6}\s+/gm);
        const musts   = countMatches(text, /\bMUST\b|\bMANDATORY\b|\bFORBIDDEN\b/g);
        const history = countMatches(text, /\b(PR|Issue|Discussion)\s+#\d+|#\d{4,}|empirical anchor|lineage|histor/ig);
        const lineRefs = countMatches(text, /[A-Za-z0-9_.\/-]+\.(mjs|md|js|json):\d+/g);
        const provenance = countMatches(text, /archaeolog|provenance|incident|origin|lineage|empirical anchor/ig);
        const triggers = countMatches(text, /trigger|when to read|read .* before|<!--\s*trigger:/ig);
        const signals = Math.round(bytes / 1000) + headings + history * 2 + lineRefs * 3 + provenance * 2 + Math.max(0, musts - 10);

        const row = {
            file: path.relative(ROOT_DIR, filePath),
            bytes,
            lines,
            headings,
            musts,
            history,
            lineRefs,
            provenance,
            triggers,
            signals
        };

        return {
            ...row,
            disposition: classifySizeReportRow(row)
        };
    }).sort((a, b) => b.signals - a.signals || b.bytes - a.bytes || a.file.localeCompare(b.file));

    return {
        summary: {
            fileCount : rows.length,
            totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
            totalLines: rows.reduce((sum, row) => sum + row.lines, 0)
        },
        rows: rows.slice(0, top)
    };
}

function formatSkillMarkdownSizeReport(report) {
    const lines = [
        '[lint-skill-manifest] Skill Markdown size report (live)',
        `files=${report.summary.fileCount} bytes=${report.summary.totalBytes} lines=${report.summary.totalLines}`,
        'rank\tbytes\tlines\tsignals\tdisposition\tfile'
    ];

    report.rows.forEach((row, index) => {
        lines.push(`${index + 1}\t${row.bytes}\t${row.lines}\t${row.signals}\t${row.disposition}\t${row.file}`);
    });

    return lines.join('\n');
}

async function payloadBytes(skillName) {
    const files = await walkFiles(path.join(SKILLS_DIR, skillName, 'references'));
    let bytes   = 0;

    for (const file of files) {
        bytes += statSync(file).size;
    }

    return bytes;
}

async function payloadFileSizes(skillName) {
    const files = await walkFiles(path.join(SKILLS_DIR, skillName, 'references'));

    return files.map(file => ({path: file, bytes: statSync(file).size}));
}

function checkPerFileBudgets(files, perFileBudget) {
    if (!Number.isInteger(perFileBudget) || perFileBudget <= 0) return [];

    const errors = [];

    for (const {path: filePath, bytes: fileBytes} of files) {
        if (fileBytes > perFileBudget) {
            errors.push(`${path.relative(ROOT_DIR, filePath)} has ${fileBytes} bytes, exceeds perFilePayloadBudget ${perFileBudget}. Extract edge-case sections to sub-rule sibling files behind one-line trigger pointers per Map vs World Atlas discipline (skill-authoring-guide.md). See #11319 / #11320 for the convention.`);
        }
    }

    return errors;
}

function parseSectionTriggers(text) {
    const index = [];
    const sections = text.split(/^(?=#{2,6}\s)/m);

    for (const section of sections) {
        if (!section.trim()) continue;

        const headerMatch = section.match(/^(#{2,6})\s+([^\n]+)/);
        if (!headerMatch) continue;

        const anchor = headerMatch[2].trim();
        const bodySizeBytes = Buffer.byteLength(section, 'utf8');

        const triggerMatch = section.match(/^<!-- trigger:\s+(.+?)\s+→\s+read\s+(.+?\.md)\s*-->$/m);
        if (triggerMatch) {
            index.push({
                anchor,
                trigger: triggerMatch[1].trim(),
                subRulePath: triggerMatch[2].trim(),
                bodySizeBytes
            });
        }
    }

    return index;
}

function checkSectionTriggers(filePath, text, rarePatterns = []) {
    const errors = [];
    const index = parseSectionTriggers(text);

    for (const entry of index) {
        if (entry.bodySizeBytes > 5000) {
            const isRare = rarePatterns.some(p => entry.trigger.toLowerCase().includes(p.toLowerCase()));
            if (isRare) {
                errors.push(`${path.relative(ROOT_DIR, filePath)} ${entry.anchor} is ${entry.bodySizeBytes} bytes with declared trigger '${entry.trigger}' (rare-firing class). Extract to sub-rule sibling file behind one-line trigger pointer per skill-authoring-guide.md §Map vs World Atlas. Reduce workflow body to: section header + <!-- trigger: ... --> pointer line.`);
            }
        }
    }

    return {errors, index};
}

function validateManifestSchema(manifest, schema) {
    const errors = [];
    const rootKeys = new Set([...schema.required, '$schema']);

    for (const key of Object.keys(manifest)) {
        if (!rootKeys.has(key)) {
            errors.push(`manifest has unsupported key: ${key}`);
        }
    }

    for (const key of schema.required) {
        if (!(key in manifest)) errors.push(`manifest missing required key: ${key}`);
    }

    if (manifest.schemaVersion !== 1) {
        errors.push('schemaVersion must be 1');
    }

    if (!manifest.skills || typeof manifest.skills !== 'object' || Array.isArray(manifest.skills)) {
        errors.push('skills must be an object');
    }

    const defaults = manifest.defaults || {};
    const defaultKeys = new Set(Object.keys(schema.properties.defaults.properties));

    for (const key of Object.keys(defaults)) {
        if (!defaultKeys.has(key)) {
            errors.push(`defaults has unsupported key: ${key}`);
        }
    }

    for (const key of schema.properties.defaults.required) {
        if (!(key in defaults)) errors.push(`defaults missing required key: ${key}`);
    }

    if (!Number.isInteger(defaults.routerByteBudget) || defaults.routerByteBudget < 1) {
        errors.push('defaults.routerByteBudget must be a positive integer');
    }

    if (!Number.isInteger(defaults.payloadBudget) || defaults.payloadBudget < 1) {
        errors.push('defaults.payloadBudget must be a positive integer');
    }

    if ('perFilePayloadBudget' in defaults && (!Number.isInteger(defaults.perFilePayloadBudget) || defaults.perFilePayloadBudget < 1)) {
        errors.push('defaults.perFilePayloadBudget must be a positive integer when set');
    }

    if ('rareTriggerPatterns' in defaults) {
        if (!Array.isArray(defaults.rareTriggerPatterns)) {
            errors.push('defaults.rareTriggerPatterns must be an array of strings');
        } else {
            for (const p of defaults.rareTriggerPatterns) {
                if (typeof p !== 'string') errors.push('defaults.rareTriggerPatterns must be an array of strings');
            }
        }
    }

    if ('oversizedWorkflowMaps' in defaults) {
        if (!Array.isArray(defaults.oversizedWorkflowMaps)) {
            errors.push('defaults.oversizedWorkflowMaps must be an array of strings');
        } else {
            for (const p of defaults.oversizedWorkflowMaps) {
                if (typeof p !== 'string') errors.push('defaults.oversizedWorkflowMaps must be an array of strings');
            }
        }
    }

    if ('maxPositiveDeltaBytes' in defaults && (!Number.isInteger(defaults.maxPositiveDeltaBytes) || defaults.maxPositiveDeltaBytes < 0)) {
        errors.push('defaults.maxPositiveDeltaBytes must be a non-negative integer when set');
    }

    if (typeof defaults.claudeSymlinkRequired !== 'boolean') {
        errors.push('defaults.claudeSymlinkRequired must be boolean');
    }

    if (!Array.isArray(defaults.downstreamDocsTargets)) {
        errors.push('defaults.downstreamDocsTargets must be an array');
    } else if (new Set(defaults.downstreamDocsTargets).size !== defaults.downstreamDocsTargets.length) {
        errors.push('defaults.downstreamDocsTargets must contain unique entries');
    }

    const skillKeys = new Set(Object.keys(schema.$defs.skill.properties));

    for (const [skillName, skill] of Object.entries(manifest.skills || {})) {
        for (const key of Object.keys(skill)) {
            if (!skillKeys.has(key)) {
                errors.push(`${skillName} has unsupported key: ${key}`);
            }
        }

        for (const key of schema.$defs.skill.required) {
            if (!(key in skill)) errors.push(`${skillName} missing required key: ${key}`);
        }

        if (skill.name !== skillName) {
            errors.push(`${skillName} key must match entry.name`);
        }

        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name || '')) {
            errors.push(`${skillName} has invalid kebab-case name`);
        }

        if (!Number.isInteger(skill.routerByteBudget) || skill.routerByteBudget < 1) {
            errors.push(`${skillName}.routerByteBudget must be a positive integer`);
        }

        if (!Number.isInteger(skill.payloadBudget) || skill.payloadBudget < 1) {
            errors.push(`${skillName}.payloadBudget must be a positive integer`);
        }

        if ('perFilePayloadBudget' in skill && (!Number.isInteger(skill.perFilePayloadBudget) || skill.perFilePayloadBudget < 1)) {
            errors.push(`${skillName}.perFilePayloadBudget must be a positive integer when set`);
        }

        if (typeof skill.claudeSymlinkRequired !== 'boolean') {
            errors.push(`${skillName}.claudeSymlinkRequired must be boolean`);
        }

        if (typeof skill.description !== 'string' || !skill.description.length) {
            errors.push(`${skillName}.description must be a non-empty string`);
        }



        if (!Array.isArray(skill.downstreamDocsTargets)) {
            errors.push(`${skillName}.downstreamDocsTargets must be an array`);
        } else if (new Set(skill.downstreamDocsTargets).size !== skill.downstreamDocsTargets.length) {
            errors.push(`${skillName}.downstreamDocsTargets must contain unique entries`);
        } else {
            for (const target of skill.downstreamDocsTargets) {
                if (!existsSync(path.join(ROOT_DIR, target))) {
                    errors.push(`${skillName}.downstreamDocsTarget ${target} does not exist`);
                }
            }
        }

        if ('relationships' in skill && (!skill.relationships || typeof skill.relationships !== 'object' || Array.isArray(skill.relationships))) {
            errors.push(`${skillName}.relationships must be an object`);
        }
    }

    return errors;
}

function changedFiles(base) {
    const files = new Set();

    const collect = args => {
        const output = execFileSync('git', args, {
            cwd     : ROOT_DIR,
            encoding: 'utf8'
        });

        for (const file of output.split('\n').filter(Boolean)) {
            files.add(file);
        }
    };

    try {
        if (base) {
            collect(['diff', '--name-only', `${base}...HEAD`]);
        }

        collect(['diff', '--name-only']);
        collect(['diff', '--name-only', '--cached']);
        collect(['ls-files', '--others', '--exclude-standard']);

        return [...files].sort();
    } catch (error) {
        throw new Error(`Unable to compute changed files${base ? ` against ${base}` : ''}: ${error.message}`);
    }
}

function getBaseFileSize(base, filePath) {
    try {
        const output = execFileSync('git', ['cat-file', '-s', `${base}:${filePath}`], {
            cwd     : ROOT_DIR,
            encoding: 'utf8',
            stdio   : 'pipe'
        });
        return parseInt(output.trim(), 10) || 0;
    } catch (error) {
        return 0;
    }
}

function changedSkillNames(base) {
    const names = new Set();

    for (const filePath of changedFiles(base)) {
        const match = filePath.match(/^\.agents\/skills\/([^/]+)\/SKILL\.md$/);
        if (match) names.add(match[1]);
    }

    return names;
}

function checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn) {
    const errors = [];
    for (const file of changedFiles) {
        if (oversizedFiles.includes(file)) {
            const currentSize = getSizeFn(file);
            if (currentSize === null) continue;

            const baseSize = getBaseSizeFn(file);
            const delta = currentSize - baseSize;

            if (delta > maxDelta) {
                errors.push(`Oversized workflow map ${file} grew by ${delta} bytes (max allowed delta is ${maxDelta}). Extract substantive additions to a sibling file behind a one-line trigger pointer.`);
            }
        }
    }
    return errors;
}

async function lint({base = null} = {}) {
    const schema       = readJson(SCHEMA_PATH);
    const manifest     = readJson(MANIFEST_PATH);
    const errors       = validateManifestSchema(manifest, schema);
    const skillDirs    = await listSkillDirs();
    const manifestKeys = Object.keys(manifest.skills).sort();

    if (JSON.stringify(skillDirs) !== JSON.stringify(manifestKeys)) {
        errors.push(`manifest skill keys must match .agents/skills directories. dirs=${skillDirs.join(', ')} manifest=${manifestKeys.join(', ')}`);
    }

    const changed = new Set(changedFiles(base));
    const touchedSkillNames = changedSkillNames(base);

    if (base) {
        const oversizedFiles = manifest.defaults.oversizedWorkflowMaps || [];
        const maxDelta = manifest.defaults.maxPositiveDeltaBytes || 0;

        const oversizedErrors = checkOversizedWorkflowMaps(
            changed,
            oversizedFiles,
            maxDelta,
            (file) => {
                try {
                    return statSync(path.join(ROOT_DIR, file)).size;
                } catch(e) {
                    return null;
                }
            },
            (file) => getBaseFileSize(base, file)
        );
        errors.push(...oversizedErrors);
    }

    for (const skillName of skillDirs) {
        const skill     = manifest.skills[skillName];
        const skillPath = path.join(SKILLS_DIR, skillName);
        const router    = path.join(skillPath, 'SKILL.md');
        const routerRel = path.relative(ROOT_DIR, router);
        const text      = requireText(router);
        const fm        = parseFrontmatter(text, routerRel);
        const lineCount = text.trimEnd().split('\n').length;

        for (const key of ['name', 'description']) {
            if (skill[key] !== fm[key]) {
                errors.push(`${routerRel} frontmatter ${key} mismatch: manifest=${JSON.stringify(skill[key])} frontmatter=${JSON.stringify(fm[key])}`);
            }
        }

        if (lineCount > skill.routerByteBudget) {
            errors.push(`${routerRel} has ${lineCount} lines, exceeds routerByteBudget ${skill.routerByteBudget}`);
        }

        const bytes = await payloadBytes(skillName);

        if (bytes > skill.payloadBudget) {
            errors.push(`${path.relative(ROOT_DIR, skillPath)}/references has ${bytes} bytes, exceeds payloadBudget ${skill.payloadBudget}`);
        }

        const perFileBudget = skill.perFilePayloadBudget ?? manifest.defaults.perFilePayloadBudget;
        const files = await payloadFileSizes(skillName);

        if (Number.isInteger(perFileBudget) && perFileBudget > 0) {
            errors.push(...checkPerFileBudgets(files, perFileBudget));
        }

        const rarePatterns = manifest.defaults.rareTriggerPatterns || ['openapi', 'audit', 'edge-case', 'deprecation'];
        for (const {path: filePath} of files) {
            const text = requireText(filePath);
            const result = checkSectionTriggers(filePath, text, rarePatterns);
            errors.push(...result.errors);
        }

        if (skill.claudeSymlinkRequired) {
            const linkPath = path.join(CLAUDE_DIR, skillName);
            const relPath  = path.relative(ROOT_DIR, linkPath);
            const expected = `../../.agents/skills/${skillName}`;

            if (!existsSync(linkPath) || !lstatSync(linkPath).isSymbolicLink()) {
                errors.push(`${relPath} missing required symlink`);
            } else if (readlinkSync(linkPath) !== expected) {
                errors.push(`${relPath} points to ${readlinkSync(linkPath)}, expected ${expected}`);
            }
        }

        if (base && touchedSkillNames.has(skillName)) {
            let skipDocs = false;
            try {
                const commitMsgs = execFileSync('git', ['log', `${base}...HEAD`, '--pretty=%B'], {cwd: ROOT_DIR, encoding: 'utf8'});
                if (commitMsgs.includes('[skip docs]')) skipDocs = true;
            } catch (e) {
                console.warn(`[lint-skill-manifest] Warning: could not parse git log for skip-docs check: ${e.message}`);
            }

            if (!skipDocs) {
                for (const target of skill.downstreamDocsTargets) {
                    if (!changed.has(target)) {
                        errors.push(`${skillName} changed but downstreamDocsTarget ${target} was not updated in this PR`);
                    }
                }
            }
        }
    }

    return errors;
}

async function main() {
    const options = parseArgs();

    if (options.reportSizes) {
        console.log(formatSkillMarkdownSizeReport(await skillMarkdownSizeReport({top: options.top})));
        return;
    }

    const errors  = await lint(options);

    if (errors.length) {
        console.error('[lint-skill-manifest] FAILED');
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }

    console.log('[lint-skill-manifest] OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(error => {
        console.error('[lint-skill-manifest] Fatal:', error.message);
        process.exit(1);
    });
}

export {
    checkOversizedWorkflowMaps,
    checkPerFileBudgets,
    checkSectionTriggers,
    classifySizeReportRow,
    formatSkillMarkdownSizeReport,
    parseSectionTriggers,
    skillMarkdownSizeReport,
    lint,
    parseArgs,
    parseFrontmatter,
    validateManifestSchema
};
