---
number: 3394
title: Minimum Browser Requirements?
author: HLeithner
category: Q&A
createdAt: '2022-08-18T16:00:49Z'
updatedAt: '2022-08-19T15:34:13Z'
---
i wonder what the minimum browser versions of neo.mjs are? Unfortunately, I have not found anything about this in the documentation or in repo.

## Comments

### `@tobiu` commented on 2022-08-19T08:38:38Z

Hi Harald,

the browser supports looks pretty good at this point. neo is using 3 different modes:

1. development => no transpilations or builds, just running the JS code as it is
2. dist/development => webpack based build using source maps (you call this one the dev mode in e.g. react or angular)
3. dist/production => minified webpack based build => this is the version you deploy

</br>
dedicated workers (Apps which run inside one browser window)
<table>
    <tr>
        <th>Environment</th>
        <th>Chromium</th>
        <th>Firefox</th>
        <th>Safari</th>
    </tr>
    <tr>
        <td>development</td>
        <td>:white_check_mark:</td>
        <td></td>
        <td>:white_check_mark:</td>
    </tr>
    <tr>
        <td>dist/development</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
    </tr>
    <tr>
        <td>dist/production</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
    </tr>
</table>


shared workers (Apps which run inside multiple browser windows, e.g. multi screen)
<table>
    <tr>
        <th>Environment</th>
        <th>Chromium</th>
        <th>Firefox</th>
        <th>Safari</th>
    </tr>
    <tr>
        <td>development</td>
        <td>:white_check_mark:</td>
        <td></td>
        <td>:white_check_mark: *</td>
    </tr>
    <tr>
        <td>dist/development</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark: *</td>
    </tr>
    <tr>
        <td>dist/production</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark:</td>
        <td>:white_check_mark: *</td>
    </tr>
</table>

</br>
Firefox is still lacking the support for JS modules inside the worker scope, which affects the neo development mode. The team is working on it: <a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1247687">Ticket 1247687</a>
</br></br>
The support for shared workers is already live inside the Safari Technology Preview version, so it should only be a matter of time before it gets shipped into the normal Safari.

</br></br>
Best regards,
Tobias

> **Reply by `@HLeithner`** on 2022-08-19T15:34:13Z
>
> Hi Tobias,
> 
> thanks for your reply. I already have seen this support tables. But it doesn't say anythig about Browser versions. I know neo.mjs requires ES8 but I didn't found which parts of ES8 and at least at caniuse is no clear answer to which browser version supports this standard completely. 
> 
> Multi tab (shared workers) is not really relevant for my first project with neo.mjs, it's basically a map with a table and a bunch of filters. And I thought neo.mjs would fit really good on this topic. (I have seen your issue on mapbox-gl-js repo, which would be used).
> 
> regards,
> 
> Harald

---

