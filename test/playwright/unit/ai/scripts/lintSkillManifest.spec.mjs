import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'child_process';
import path                      from 'path';

import {
    parseArgs,
    parseFrontmatter,
    validateManifestSchema
} from '../../../../../ai/scripts/lint-skill-manifest.mjs';

test.describe('ai/scripts/lint-skill-manifest (#11275)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint-skill-manifest.mjs');

    test('CLI passes against the repository manifest', () => {
        const result = spawnSync('node', [scriptPath, '--base', 'HEAD'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-skill-manifest] OK');
    });

    test('frontmatter parser preserves colon-bearing trigger text', () => {
        const parsed = parseFrontmatter(`---\nname: test-skill\ndescription: Short: description\ntriggers: Use when the task says: test\n---\n# Body\n`, 'fixture/SKILL.md');

        expect(parsed.name).toBe('test-skill');
        expect(parsed.description).toBe('Short: description');
        expect(parsed.triggers).toBe('Use when the task says: test');
    });

    test('schema validator catches missing required skill fields', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                broken: {
                    name                : 'broken',
                    description         : 'missing trigger',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toContain('broken missing required key: triggers');
    });

    test('schema validator catches unsupported manifest fields', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: [],
                extraDefault         : true
            },
            skills: {
                extra: {
                    name                : 'extra',
                    description         : 'has extra key',
                    triggers            : 'Use for tests.',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: [],
                    extraSkill          : true
                }
            },
            extraRoot: true
        }, schema);

        expect(errors).toContain('manifest has unsupported key: extraRoot');
        expect(errors).toContain('defaults has unsupported key: extraDefault');
        expect(errors).toContain('extra has unsupported key: extraSkill');
    });

    test('schema validator treats relationships as optional future-extension metadata', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget        : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                optional: {
                    name                : 'optional',
                    description         : 'relationship field omitted intentionally',
                    triggers            : 'Use for tests.',
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toEqual([]);
    });

    test('argument parser supports --base forms', () => {
        expect(parseArgs(['--base', 'origin/dev']).base).toBe('origin/dev');
        expect(parseArgs(['--base=HEAD']).base).toBe('HEAD');
    });
});
