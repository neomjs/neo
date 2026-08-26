import Base     from './Base.mjs';
import fs       from 'fs-extra';
import path     from 'path';
import fg       from 'fast-glob';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Indexes a skill document's trigger pointers by section.
 *
 * Lived in `ai/scripts/lint/lint-skill-manifest.mjs` until that lint retired with the corpus it
 * validated — this extractor was its only importer, so the parser moved to its consumer rather than
 * keeping a retired lint alive for one function. A trigger comment marks a section whose body is
 * delegated to a sub-rule file; the Knowledge Base carries that pointer into the chunk metadata so a
 * reader can follow it.
 *
 * @param {String} text Markdown source of one skill document.
 * @returns {Object[]} One entry per section carrying a trigger comment.
 */
export function parseSectionTriggers(text) {
    const index    = [];
    const sections = text.split(/^(?=#{2,6}\s)/m);

    for (const section of sections) {
        if (!section.trim()) continue;

        const headerMatch = section.match(/^(#{2,6})\s+([^\n]+)/);
        if (!headerMatch) continue;

        const anchor        = headerMatch[2].trim();
        const bodySizeBytes = Buffer.byteLength(section, 'utf8');

        const triggerMatch = section.match(/^<!-- trigger:\s+(.+?)\s+→\s+read\s+(.+?\.md)\s*-->$/m);
        if (triggerMatch) {
            index.push({
                anchor,
                trigger    : triggerMatch[1].trim(),
                subRulePath: triggerMatch[2].trim(),
                bodySizeBytes
            });
        }
    }

    return index;
}

/**
 * @summary Extracts knowledge chunks from Skill Markdown files.
 *
 * This source provider scans the `.agents/skills` directory for Markdown files.
 * It chunks documents by headers and extracts sub-metadata like `skillName`,
 * `sectionAnchor`, `triggerCondition`, and trigger-pointer sub-rule metadata.
 *
 * @class Neo.ai.services.knowledge-base.source.SkillSource
 * @extends Neo.ai.services.knowledge-base.source.Base
 * @singleton
 */
class SkillSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.source.SkillSource'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.source.SkillSource',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Extracts knowledge chunks from Skill files.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        // Per-source path from the `sourcePaths` config (SSOT).
        const skillsBasePath = path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths.SkillSource);

        if (await fs.pathExists(skillsBasePath)) {
            // Using fast-glob to recursively find all .md files in the skills directory
            const pattern = path.join(skillsBasePath, '**/*.md').replace(/\\/g, '/');
            const skillFiles = await fg(pattern);

            const triggerTargetPathsBySkill = await this.collectTriggerTargetPathsBySkill(skillFiles, skillsBasePath);

            for (const filePath of skillFiles) {
                const content = await fs.readFile(filePath, 'utf-8');
                const relativePath = path.relative(aiConfig.neoRootDir, filePath);
                const skillRelativePath       = path.relative(skillsBasePath, filePath);
                const pathParts               = skillRelativePath.split(path.sep);
                const skillFolder             = pathParts[0];
                const skillTriggerTargets     = triggerTargetPathsBySkill.get(skillFolder);
                const normalizedSkillPath     = this.normalizeRelativePath(skillRelativePath);
                const isAtlasMonolithSubRule  = skillTriggerTargets?.size
                    ? skillTriggerTargets.has(normalizedSkillPath)
                    : pathParts.includes('references');

                let skillName = skillFolder;
                let triggerCondition = '';
                let contentToParse = content;

                // Parse YAML frontmatter
                const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
                if (yamlMatch) {
                    const yaml = yamlMatch[1];
                    const nameMatch = yaml.match(/^name:\s*(.*)/m);
                    if (nameMatch) {
                        skillName = nameMatch[1].trim();
                    }

                    const triggerMatch = yaml.match(/^triggers:\s*(.*)/m);
                    if (triggerMatch) {
                        triggerCondition = triggerMatch[1].trim();
                    }

                    contentToParse = content.substring(yamlMatch[0].length).trim();
                }

                // Split by headers for chunking
                const sectionsRegex = /(?=^#+\s)/m;
                const sections = contentToParse.split(sectionsRegex);

                for (const section of sections) {
                    if (section.trim() === '') continue;

                    const headingMatch = section.match(/^#+\s(.*)/);
                    const sectionAnchor = headingMatch ? headingMatch[1].trim() : '';

                    const chunkName = `${skillName}${sectionAnchor ? ` - ${sectionAnchor}` : ''}`;

                    const chunk = {
                        type: 'skill',
                        kind: 'skill',
                        name: chunkName,
                        content: section.trim(),
                        source: relativePath,
                        // Per-section skill sub-metadata (name, anchor, trigger).
                        skillName,
                        sectionAnchor,
                        triggerCondition,
                        isAtlasMonolithSubRule
                    };

                    chunk.hash = createHashFn(chunk);
                    writeStream.write(JSON.stringify(chunk) + '\n');
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Builds a per-skill set of files targeted by trigger-pointer comments.
     * @param {String[]} skillFiles      Absolute skill markdown file paths.
     * @param {String}   skillsBasePath Absolute `.agents/skills` path.
     * @returns {Promise<Map<String, Set<String>>>}
     */
    async collectTriggerTargetPathsBySkill(skillFiles, skillsBasePath) {
        const targetPathsBySkill = new Map();

        for (const filePath of skillFiles) {
            const skillRelativePath = path.relative(skillsBasePath, filePath);
            const pathParts         = skillRelativePath.split(path.sep);
            const skillFolder       = pathParts[0];
            const content           = await fs.readFile(filePath, 'utf-8');
            const sectionTriggers   = parseSectionTriggers(content);

            if (!sectionTriggers.length) continue;

            const skillTargets = targetPathsBySkill.get(skillFolder) || new Set();
            targetPathsBySkill.set(skillFolder, skillTargets);

            for (const {subRulePath} of sectionTriggers) {
                const targetPath     = path.resolve(path.dirname(filePath), subRulePath);
                const targetRelative = this.normalizeRelativePath(path.relative(skillsBasePath, targetPath));

                if (!targetRelative.startsWith(`${skillFolder}/`)) continue;

                skillTargets.add(targetRelative);
            }
        }

        return targetPathsBySkill;
    }

    /**
     * Normalizes relative filesystem paths for trigger-target matching.
     * @param {String} filePath Relative file path.
     * @returns {String}
     */
    normalizeRelativePath(filePath) {
        return filePath.split(path.sep).join('/');
    }
}

export default Neo.setupClass(SkillSource);
