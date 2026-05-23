import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'child_process';
import path                      from 'path';

import {
    checkOversizedWorkflowMaps,
    checkPerFileBudgets,
    checkSectionTriggers,
    parseArgs,
    parseFrontmatter,
    parseSectionTriggers,
    validateManifestSchema
} from '../../../../../../ai/scripts/lint/lint-skill-manifest.mjs';

test.describe('ai/scripts/lint-skill-manifest (#11275)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-skill-manifest.mjs');

    test('CLI passes against the repository manifest', () => {
        const result = spawnSync('node', [scriptPath, '--base', 'HEAD'], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-skill-manifest] OK');
    });

    test('frontmatter parser preserves colon-bearing description text', () => {
        const parsed = parseFrontmatter(`---\nname: test-skill\ndescription: Short: description\n---\n# Body\n`, 'fixture/SKILL.md');

        expect(parsed.name).toBe('test-skill');
        expect(parsed.description).toBe('Short: description');
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
                    routerByteBudget    : 12,
                    payloadBudget        : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toContain('broken missing required key: description');
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

    test('schema validator accepts perFilePayloadBudget as optional defaults field (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                perFilePayloadBudget: 25000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {}
        }, schema);

        expect(errors).not.toContain('defaults has unsupported key: perFilePayloadBudget');
        expect(errors).not.toContain('defaults.perFilePayloadBudget must be a positive integer when set');
    });

    test('schema validator accepts perFilePayloadBudget as optional per-skill override (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'monolith-skill': {
                    name                : 'monolith-skill',
                    description         : 'temporary override for migration-period monolith',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    perFilePayloadBudget: 66000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).not.toContain('monolith-skill has unsupported key: perFilePayloadBudget');
        expect(errors).not.toContain('monolith-skill.perFilePayloadBudget must be a positive integer when set');
    });

    test('schema validator rejects non-positive perFilePayloadBudget (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errorsZeroDefault = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                perFilePayloadBudget: 0,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {}
        }, schema);

        expect(errorsZeroDefault).toContain('defaults.perFilePayloadBudget must be a positive integer when set');

        const errorsNegativeSkill = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'bad-budget': {
                    name                : 'bad-budget',
                    description         : 'negative budget',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    perFilePayloadBudget: -100,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errorsNegativeSkill).toContain('bad-budget.perFilePayloadBudget must be a positive integer when set');
    });

    test('checkPerFileBudgets returns an error for files exceeding the per-file budget (#11320 AC9)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/over-budget.md'),  bytes: 30000},
            {path: path.join(repoRoot, '.agents/skills/example/references/under-budget.md'), bytes: 10000}
        ];

        const errors = checkPerFileBudgets(files, 25000);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('over-budget.md has 30000 bytes, exceeds perFilePayloadBudget 25000');
        expect(errors[0]).toContain('Map vs World Atlas');
        expect(errors[0]).toContain('skill-authoring-guide.md');
    });

    test('checkPerFileBudgets returns no errors when all files are within budget (#11320 AC9)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/a.md'), bytes: 10000},
            {path: path.join(repoRoot, '.agents/skills/example/references/b.md'), bytes: 24999}
        ];

        expect(checkPerFileBudgets(files, 25000)).toEqual([]);
    });

    test('checkPerFileBudgets treats null/undefined/non-positive budget as disabled per omit-to-disable contract (#11320 AC8)', () => {
        const repoRoot = path.resolve(process.cwd());
        const files    = [
            {path: path.join(repoRoot, '.agents/skills/example/references/huge.md'), bytes: 1000000}
        ];

        expect(checkPerFileBudgets(files, undefined)).toEqual([]);
        expect(checkPerFileBudgets(files, null)).toEqual([]);
        expect(checkPerFileBudgets(files, 0)).toEqual([]);
        expect(checkPerFileBudgets(files, -1)).toEqual([]);
    });

    test('schema validator preserves backwards compatibility when perFilePayloadBudget is omitted (#11320)', () => {
        const schema = JSON.parse(execFileSync('node', ['-e', "process.stdout.write(require('fs').readFileSync('.agents/skills/skills.manifest.schema.json', 'utf8'))"], {
            cwd     : process.cwd(),
            encoding: 'utf8'
        }));

        const errors = validateManifestSchema({
            schemaVersion: 1,
            sourceOfTruth: 'test',
            defaults     : {
                routerByteBudget    : 12,
                payloadBudget       : 80000,
                claudeSymlinkRequired: true,
                downstreamDocsTargets: []
            },
            skills: {
                'legacy-skill': {
                    name                : 'legacy-skill',
                    description         : 'pre-#11320 manifest entry without perFilePayloadBudget',
                    routerByteBudget    : 12,
                    payloadBudget       : 80000,
                    claudeSymlinkRequired: true,
                    downstreamDocsTargets: []
                }
            }
        }, schema);

        expect(errors).toEqual([]);
    });

    test('checkSectionTriggers returns no errors for sections without triggers or below size threshold (#11320)', () => {
        const text = `
## §1 Short Section
<!-- trigger: this is an edge-case → read ./sub-rule.md -->
Just a short body, well under 5000 bytes.
        `;
        expect(checkSectionTriggers('test.md', text, ['edge-case']).errors).toEqual([]);
    });

    test('checkSectionTriggers returns no errors for large sections without rare triggers (#11320)', () => {
        const padding = 'A'.repeat(6000);
        const text = `
## §2 Large Common Section
<!-- trigger: always relevant → read ./sub-rule.md -->
${padding}
        `;
        expect(checkSectionTriggers('test.md', text, ['edge-case', 'openapi']).errors).toEqual([]);
    });

    test('checkSectionTriggers returns error for large sections with rare triggers (#11320)', () => {
        const padding = 'B'.repeat(6000);
        const text = `
## §3 OpenAPI Edge Case
<!-- trigger: modifies openapi.yaml → read ./openapi-audit.md -->
${padding}
        `;
        const {errors} = checkSectionTriggers('.agents/skills/example/references/test.md', text, ['edge-case', 'openapi']);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('.agents/skills/example/references/test.md §3 OpenAPI Edge Case is ');
        expect(errors[0]).toContain("bytes with declared trigger 'modifies openapi.yaml' (rare-firing class)");
        expect(errors[0]).toContain("Extract to sub-rule sibling file behind one-line trigger pointer per skill-authoring-guide.md §Map vs World Atlas.");
    });

    test('parseSectionTriggers extracts anchor, trigger, subRulePath, and body size (#11320)', () => {
        const padding = 'C'.repeat(100);
        const text = `
## §4 Test Section
<!-- trigger: test condition → read ./test-rule.md -->
${padding}
        `;
        const index = parseSectionTriggers(text);
        expect(index).toHaveLength(1);
        expect(index[0].anchor).toBe('§4 Test Section');
        expect(index[0].trigger).toBe('test condition');
        expect(index[0].subRulePath).toBe('./test-rule.md');
        expect(index[0].bodySizeBytes).toBeGreaterThan(100);
    });

    test('checkOversizedWorkflowMaps passes when one-line pointer addition is within maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pr-review-guide.md', 'some-other-file.md']);
        const oversizedFiles = ['pr-review-guide.md', 'pull-request-workflow.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => file === 'pr-review-guide.md' ? 1200 : 0;
        const getBaseSizeFn = (file) => file === 'pr-review-guide.md' ? 1000 : 0; // Delta: 200

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toEqual([]);
    });

    test('checkOversizedWorkflowMaps fails when PR #11434-style inline addition exceeds maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pull-request-workflow.md']);
        const oversizedFiles = ['pr-review-guide.md', 'pull-request-workflow.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => 1500;
        const getBaseSizeFn = (file) => 1000; // Delta: 500

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Oversized workflow map pull-request-workflow.md grew by 500 bytes (max allowed delta is 250).');
        expect(errors[0]).toContain('Extract substantive additions to a sibling file behind a one-line trigger pointer.');
    });

    test('checkOversizedWorkflowMaps fails when long pr-review-guide.md anti-pattern row exceeds maxPositiveDeltaBytes (#11437)', () => {
        const changedFiles = new Set(['pr-review-guide.md']);
        const oversizedFiles = ['pr-review-guide.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => 2300;
        const getBaseSizeFn = (file) => 1000; // Delta: 1300

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Oversized workflow map pr-review-guide.md grew by 1300 bytes');
    });

    test('checkOversizedWorkflowMaps ignores deleted oversized files', () => {
        const changedFiles = new Set(['pr-review-guide.md']);
        const oversizedFiles = ['pr-review-guide.md'];
        const maxDelta = 250;

        const getSizeFn = (file) => null; // File deleted
        const getBaseSizeFn = (file) => 1000;

        const errors = checkOversizedWorkflowMaps(changedFiles, oversizedFiles, maxDelta, getSizeFn, getBaseSizeFn);
        expect(errors).toEqual([]);
    });
});
