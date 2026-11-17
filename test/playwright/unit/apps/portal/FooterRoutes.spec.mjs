import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    root           = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../'),
    footerPath     = path.join(root, 'apps/portal/view/home/FooterContainer.mjs'),
    controllerPath = path.join(root, 'apps/portal/view/ViewportController.mjs');

test.describe('Portal footer Blog button', () => {
    test('routes to the blog list at a route the ViewportController resolves', () => {
        const footerSource = fs.readFileSync(footerPath, 'utf-8');

        // The Blog button points at the blog list, /news/blog ...
        expect(footerSource).toMatch(/route\s*:\s*'\/news\/blog',\s*\r?\n\s*text\s*:\s*'Blog'/);

        // ... and never at the dead /blog route the ViewportController does not know.
        expect(footerSource).not.toMatch(/route\s*:\s*'\/blog'/);

        // The route resolves: ViewportController declares the /news/{*itemId} pattern.
        const controllerSource = fs.readFileSync(controllerPath, 'utf-8');
        expect(controllerSource).toMatch(/'\/news\/\{\*itemId\}'\s*:/);
    });
});
