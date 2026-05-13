import Base     from './Base.mjs';
import fs       from 'fs-extra';
import path     from 'path';
import fg       from 'fast-glob';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

/**
 * @summary Extracts knowledge chunks from Skill Markdown files.
 *
 * This source provider scans the `.agents/skills` directory for Markdown files.
 * It chunks documents by headers and extracts sub-metadata like `skillName`,
 * `sectionAnchor`, and `triggerCondition`.
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
        const skillsBasePath = path.resolve(aiConfig.neoRootDir, '.agents/skills');

        if (await fs.pathExists(skillsBasePath)) {
            // Using fast-glob to recursively find all .md files in the skills directory
            const pattern = path.join(skillsBasePath, '**/*.md').replace(/\\/g, '/');
            const skillFiles = await fg(pattern);

            for (const filePath of skillFiles) {
                const content = await fs.readFile(filePath, 'utf-8');
                const relativePath = path.relative(aiConfig.neoRootDir, filePath);
                const skillRelativePath = path.relative(skillsBasePath, filePath);
                const pathParts = skillRelativePath.split(path.sep);
                const skillFolder = pathParts[0];

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
                        // Sub-metadata for #11316 AC
                        skillName,
                        sectionAnchor,
                        triggerCondition
                    };

                    chunk.hash = createHashFn(chunk);
                    writeStream.write(JSON.stringify(chunk) + '\n');
                    count++;
                }
            }
        }

        return count;
    }
}

export default Neo.setupClass(SkillSource);
