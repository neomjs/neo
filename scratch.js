import fs from 'fs';

const content = fs.readFileSync('.agents/skills/pr-review/SKILL.md', 'utf-8');

const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
let skillName = '';
let triggerCondition = '';

if (yamlMatch) {
    const yaml = yamlMatch[1];
    const nameMatch = yaml.match(/^name:\s*(.+)/m);
    if (nameMatch) skillName = nameMatch[1].trim();

    const triggersMatch = yaml.match(/^triggers:\s*(.+)/m);
    if (triggersMatch) triggerCondition = triggersMatch[1].trim();
}

console.log({ skillName, triggerCondition });

const body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
const sectionsRegex = /(?=^#+\s)/m;
const sections = body.split(sectionsRegex);

console.log('Sections:');
sections.forEach(section => {
    if (section.trim() === '') return;
    const headingMatch = section.match(/^#+\s(.*)/);
    const sectionAnchor = headingMatch ? headingMatch[1].trim() : skillName;
    console.log({ sectionAnchor, length: section.length });
});
