/**
 * @summary The explorer's project, a small web shop: folders first, then files, each sorted by name, the order the
 * tree shows them in. `logs` lists its 365 files in `resources/examples/data/fileExplorer/logs.json` and loads
 * them when it first opens.
 * @type {Object[]}
 */
export const PROJECT = [
    {id: 'github',         name: '.github',            isLeaf: false},
    {id: 'workflows',      name: 'workflows',          isLeaf: false, parentId: 'github'},
    {id: 'ci',             name: 'ci.yml',             parentId: 'workflows', size: 1840,  modified: '2026-10-02'},
    {id: 'release',        name: 'release.yml',        parentId: 'workflows', size: 2215,  modified: '2026-09-14'},
    {id: 'docs',           name: 'docs',               isLeaf: false},
    {id: 'architecture',   name: 'architecture.md',    parentId: 'docs',      size: 9412,  modified: '2026-08-30'},
    {id: 'gettingStarted', name: 'getting-started.md', parentId: 'docs',      size: 4120,  modified: '2026-11-03'},
    {id: 'logs',           name: 'logs',               isLeaf: false, listing: 'fileExplorer/logs.json'},
    {id: 'public',         name: 'public',             isLeaf: false},
    {id: 'images',         name: 'images',             isLeaf: false, parentId: 'public'},
    {id: 'hero',           name: 'hero.jpg',           parentId: 'images',    size: 284133, modified: '2026-07-21'},
    {id: 'logo',           name: 'logo.svg',           parentId: 'images',    size: 3071,   modified: '2026-03-11'},
    {id: 'productBag',     name: 'product-bag.webp',   parentId: 'images',    size: 48210,  modified: '2026-10-18'},
    {id: 'productLamp',    name: 'product-lamp.webp',  parentId: 'images',    size: 51988,  modified: '2026-10-18'},
    {id: 'productMug',     name: 'product-mug.webp',   parentId: 'images',    size: 39407,  modified: '2026-10-18'},
    {id: 'favicon',        name: 'favicon.svg',        parentId: 'public',    size: 912,    modified: '2026-03-11'},
    {id: 'robots',         name: 'robots.txt',         parentId: 'public',    size: 64,     modified: '2026-02-01'},
    {id: 'src',            name: 'src',                isLeaf: false, collapsed: false},
    {id: 'components',     name: 'components',         isLeaf: false, parentId: 'src', collapsed: false},
    {id: 'button',         name: 'Button.mjs',         parentId: 'components', size: 2380, modified: '2026-09-09'},
    {id: 'cart',           name: 'Cart.mjs',           parentId: 'components', size: 6104, modified: '2026-11-19'},
    {id: 'header',         name: 'Header.mjs',         parentId: 'components', size: 3317, modified: '2026-10-27'},
    {id: 'productCard',    name: 'ProductCard.mjs',    parentId: 'components', size: 4489, modified: '2026-11-12'},
    {id: 'pages',          name: 'pages',              isLeaf: false, parentId: 'src'},
    {id: 'checkout',       name: 'Checkout.mjs',       parentId: 'pages',     size: 8730,  modified: '2026-11-20'},
    {id: 'home',           name: 'Home.mjs',           parentId: 'pages',     size: 5021,  modified: '2026-10-05'},
    {id: 'product',        name: 'Product.mjs',        parentId: 'pages',     size: 6642,  modified: '2026-11-08'},
    {id: 'services',       name: 'services',           isLeaf: false, parentId: 'src'},
    {id: 'api',            name: 'api.mjs',            parentId: 'services',  size: 3908,  modified: '2026-09-28'},
    {id: 'payments',       name: 'payments.mjs',       parentId: 'services',  size: 7215,  modified: '2026-11-17'},
    {id: 'styles',         name: 'styles',             isLeaf: false, parentId: 'src'},
    {id: 'base',           name: 'base.css',           parentId: 'styles',    size: 5530,  modified: '2026-08-12'},
    {id: 'theme',          name: 'theme.css',          parentId: 'styles',    size: 2764,  modified: '2026-10-30'},
    {id: 'app',            name: 'app.mjs',            parentId: 'src',       size: 1206,  modified: '2026-11-02'},
    {id: 'indexHtml',      name: 'index.html',         parentId: 'src',       size: 698,   modified: '2026-06-17'},
    {id: 'tests',          name: 'tests',              isLeaf: false},
    {id: 'cartSpec',       name: 'cart.spec.mjs',      parentId: 'tests',     size: 4977,  modified: '2026-11-19'},
    {id: 'checkoutSpec',   name: 'checkout.spec.mjs',  parentId: 'tests',     size: 6311,  modified: '2026-11-20'},
    {id: 'gitignore',      name: '.gitignore',         size: 211,   modified: '2026-02-01'},
    {id: 'packageJson',    name: 'package.json',       size: 1544,  modified: '2026-11-15'},
    {id: 'readme',         name: 'README.md',          size: 3802,  modified: '2026-11-03'}
];
