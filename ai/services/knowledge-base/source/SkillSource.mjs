import Base     from './Base.mjs';
import fg       from 'fast-glob';
import fs       from 'fs-extra';
import path     from 'path';
import aiConfig from '../../../mcp/server/knowledge-base/config.mjs';

const sectionsRegex = /(?=^#+\s)/m;

/**
 * @summary Extracts knowledge chunks from '.agents/skills/**/*.md' files.
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
     * Extracts knowledge chunks from '.agents/skills/**/*.md' files.
     * @param {Object}   writeStream  The JSONL write stream.
     * @param {Function} createHashFn Function to create content hash.
     * @returns {Promise<Number>} The number of chunks extracted.
     */
    async extract(writeStream, createHashFn) {
        let count = 0;
        const skillsGlob = path.join(aiConfig.neoRootDir, '.agents/skills/**/*.md').replace(/\\/g, '/');
        const files = await fg(skillsGlob);

        for (const filePath of files) {
            const content = await fs.readFile(filePath, 'utf-8');
            
            // Extract YAML frontmatter
            let skillName = '';
            let triggerCondition = '';
            
            const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (yamlMatch) {
                const yaml = yamlMatch[1];
                const nameMatch = yaml.match(/^name:\s*(.+)/m);
                if (nameMatch) skillName = nameMatch[1].trim();

                const triggersMatch = yaml.match(/^triggers:\s*(.+)/m);
                if (triggersMatch) triggerCondition = triggersMatch[1].trim();
            }

            // Default to filename if name not in frontmatter
            if (!skillName) {
                skillName = path.basename(filePath, '.md');
            }

            const isAtlasMonolithSubRule = false; // By definition, skill markdown files are not the monolith.

            const body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
            const sections = body.split(sectionsRegex);

            for (const section of sections) {
                if (section.trim() === '') continue;
                
                const headingMatch = section.match(/^#+\s(.*)/);
                const sectionAnchor = headingMatch ? headingMatch[1].trim() : skillName;
                
                const chunk = {
                    type                  : 'skill',
                    kind                  : 'skill',
                    name                  : `${skillName} - ${sectionAnchor}`,
                    id                    : `${skillName}-${sectionAnchor.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
                    content               : section,
                    source                : path.relative(aiConfig.neoRootDir, filePath),
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
        
        return count;
    }
}

export default Neo.setupClass(SkillSource);
