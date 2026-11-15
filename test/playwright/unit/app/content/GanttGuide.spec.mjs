import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    root      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../'),
    treePath  = path.join(root, 'learn/tree.json'),
    guidePath = path.join(root, 'learn/guides/datahandling/Gantt.md'),
    seoPath   = path.join(root, 'apps/portal/resources/data/seo.json');

test.describe('Gantt chart guide registration and structure (#21038)', () => {
    test('learn/tree.json registers guides/datahandling/Gantt after grid pages', () => {
        expect(fs.existsSync(treePath)).toBe(true);
        const tree  = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
        const entry = tree.data.find(item => item.id === 'guides/datahandling/Gantt');

        expect(entry).toBeDefined();
        expect(entry.name).toBe('Gantt Charts & Linked Tasks');
        expect(entry.parentId).toBe('guides/datahandling');

        const ids          = tree.data.map(item => item.id);
        const streamingIdx = ids.indexOf('guides/datahandling/Streaming');
        const ganttIdx     = ids.indexOf('guides/datahandling/Gantt');

        expect(ganttIdx).toBe(streamingIdx + 1);
    });

    test('learn/guides/datahandling/Gantt.md exists with frontmatter and required seven sections', () => {
        expect(fs.existsSync(guidePath)).toBe(true);
        const content = fs.readFileSync(guidePath, 'utf-8');
        const lines   = content.split('\n');

        expect(lines.length).toBeGreaterThanOrEqual(150);
        expect(lines.length).toBeLessThanOrEqual(300);

        expect(content).toContain('seoTitle: "Building Gantt Charts with Linked Tasks | Neo.mjs"');
        expect(content).toContain('seoDescription:');

        const requiredSections = [
            '## 1. What a Gantt Chart Is in Neo.mjs',
            '## 2. A Minimal Chart',
            '## 3. The Task Record',
            '## 4. The Dependency Record',
            '## 5. The Cascade',
            '## 6. Working Time & Calendars',
            '## 7. Interactive Links & Next Steps'
        ];

        let lastPos = -1;
        for (const heading of requiredSections) {
            const pos = content.indexOf(heading);
            expect(pos, `heading '${heading}' must be present in order`).toBeGreaterThan(lastPos);
            lastPos = pos;
        }

        // Must link the basic example
        expect(content).toContain('examples/gantt/basic');
    });

    test('apps/portal/resources/data/seo.json indexes the Gantt guide route', () => {
        expect(fs.existsSync(seoPath)).toBe(true);
        const seo = JSON.parse(fs.readFileSync(seoPath, 'utf-8'));

        expect(seo['/learn/guides/datahandling/Gantt']).toBeDefined();
        expect(seo['/learn/guides/datahandling/Gantt'].title).toContain('Gantt');
    });
});
