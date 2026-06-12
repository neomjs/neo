---
id: 5112
title: '6.10.2 dev env:  DefaultConfig  themes not used ?'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-11-29T06:50:54Z'
updatedAt: '2024-08-31T08:45:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5112'
author: gplanansky
commentsCount: 8
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-31T08:45:02Z'
---
# 6.10.2 dev env:  DefaultConfig  themes not used ?

**Describe the bug**
 
6.10.2 developer environment neo-config.json lacking "themes" entry, opening app get:

     container1/:1 Refused to apply style from 'http://localhost:8080/dist/development/css/theme-neo-light/Global.css'  
     because its MIME type ('text/html') is not a supported stylesheet MIME type, and strict MIME checking is enabled.

**To Reproduce**

In 6.10.2 workspace running as developer with "npm run server-start"  and
neo-config.json **lacking**  a "themes" entry:

```
{
    "appPath"         : "../../apps/container1/app.mjs",
    "basePath"        : "../../",
    "environment"     : "development",
    "mainPath"        : "../node_modules/neo.mjs/src/Main.mjs",
    "mainThreadAddons": ["DragDrop","Stylesheet"],
    "workerBasePath"  : "../../node_modules/neo.mjs/src/worker/"
}
```

The error message does not occur with the added entry:

     "themes"          : ["neo-theme-light"],

**Expected behavior**

The error message did not appear with Neo 6.92 and previous versions.
I presume they used the default themes value in  DefaultConfig.mjs.

**Additional context**

I noticed but do not know the implications of (nor did I do anything as a result :-) )
 the neo 6.10.0 release comment:

    moved all dependencies into devDependencies
    you need to add all devDependencies into your workspaces




## Timeline

- 2023-11-29T06:50:54Z @gplanansky added the `bug` label
### @tobiu - 2023-11-29T08:51:09Z

Hi George!

Regarding the `devDependencies`: they already get included into new workspaces:
https://github.com/neomjs/create-app/blob/master/tasks/createPackageJson.mjs#L27

You will need to add them to your own workspace too. Rationale: The idea to drop everything into "hard" dependencies was simply that not every workspace needs to add them as well, since workspaces use the build programs on framework level. However, on our current client project, tools like Sonar went nuts with code smells and security warning for code which is just used for builds. So, we switched all dependencies into devDependencies, which they are. Feels cleaner and reduces the amount of work for flagging false positives.

@mxmrtns started to work on a new theme (neo-theme-neo-light) for the new website and learning section. Still early stage. To test it with current examples, we added it into the framework default config for themes.

Meaning: if your `neo-config.json` does not contain a themes property, it will contain all 3 themes now. You can easily change this with adding it in there, e.g.: `"themes": ["neo-theme-dark"]`.

In case you are getting errors, I recommend to run a themes build.

If this does not help, please give me a heads-up. Otherwise you can delete the dist folder, delete resources/theme-map.json and run a build-all.

Best regards,
Tobi

### @gplanansky - 2023-11-29T10:21:09Z

correction:  it was 6.10.1 not 6.10.2 .

1.  npx neo-app@latest   -->  install 6.10.1,  myapp, starts myapp: 

      myapp neo-config.json:   no themes line.
      dev tools console on my app:   mime type error

2.  edit package.json    6.10.1  --> 6.10.2  , npm install  -->   No matching version found for neo.mjs@^6.10.2.

3.  npm run build-themes  -->  no change

4. remove dist folder, remove resources/theme-map.json     , npm run build-all   --> no change
     
Should I create the workspace a different way?


### @tobiu - 2023-11-29T10:26:31Z

6.10.1 is the latest version => https://github.com/neomjs/neo/releases

although it won't take long before we create the next release.

### @gplanansky - 2023-11-29T10:55:34Z

If the experimental theme is in the list in neo-config.json, e.g.

      "themes": ["neo-theme-light","neo-theme-neo-light"],

the error appears.   So absent a neo-config themes line, Neo **is** getting that updated value from DefaultConfig.mjs, but it then provokes the error message.

### @gplanansky - 2024-06-23T18:51:37Z

as of 6.17.2   the theming still does not work  correctly

```
vdom: {
            cn: [{
                tag: 'h1',
		innerHTML : 'Hello World!',
            }]
	}
```


1. with No themes line in neo-config.json,
    h1 tag   is Not styled

2. with a neo-config.json themes line having "neo-theme-neo-light" as any but the first value ... e.g. 
     `"themes": ["neo-theme-light", "neo-theme-dark", "neo-theme-neo-light"]`
  h1 tag is Not styled

3. otherwise, the h1 tag is correctly styled

Expected behavior:   

The src/DefaultConfig.mjs    themes value should work gracefully
     currently that value is:
     `themes: ['neo-theme-light', 'neo-theme-dark', 'neo-theme-neo-light'],`
     and it does not work.
Not surprisingly, the same breakage happens  using neo-config.json





### @tobiu - 2024-06-23T18:59:53Z

@mxmrtns introduced styling for basic tags for the new theme:
https://github.com/neomjs/neo/blob/dev/resources/scss/theme-neo-light/Global.scss#L10

these rules do not exist inside the other 2 themes yet:
https://github.com/neomjs/neo/blob/dev/resources/scss/theme-light/Global.scss

i did a small change to at least now scope the rules into the root & theme selector, but this does not exclude the changes from other themes. in a nutshell:

```
<div class="neo-theme-neo-light">
    <h1>Foo</h1> // styled
</div>

<div class="neo-theme-dark">
    <h1>Bar</h1> // not styled
</div>

<div class="neo-theme-neo-light">
    <div class="neo-theme-dark">
        <h1>Baz</h1> // styled, although it probably should not be
    </div>
</div>
```

### @gplanansky - 2024-06-24T00:40:03Z

I do not understand.

A year ago, using the h1 tag worked with at least neo-theme-light.   I have
a workspace from that time to check with: it works.  On inspection there is
a styling rule that kicks in for h2.

A day ago, h1 tag styling it worked  for 6.17.2 if any of the three themes
were explicitly specified, as a single entry on the themes array,  in
neo-config.json.   But, going with the default,  with the three values as
items in the themes array -- per the getting started  "npx neo-app" recipe
-- did not work.  Given that each theme  value worked on its own,   My
guess was that the problem lay not  with the new theme per se, but in
parsing the themes object.

I think a getting-started default that does not work makes a negative
impression, so it is desirable to fix that.

So,  do I gather correctly that only the new theme is meant to work?   And
we should Not use the other two themes?   I personally think the non-serif
fonts are suitable for more situations than the serif font in the new
theme.  Be that as it may,  an outcome that discards two of the three
themes  surprises me.


However, using the default, which is what  npx neo-app delivers in
configuring myapp with default choices,
that failed.  We


On Sun, Jun 23, 2024 at 3:00 PM Tobias Uhlig ***@***.***>
wrote:

> @mxmrtns <https://github.com/mxmrtns> introduced styling for basic tags
> for the new theme:
>
> https://github.com/neomjs/neo/blob/dev/resources/scss/theme-neo-light/Global.scss#L10
>
> these rules do not exist inside the other 2 themes yet:
>
> https://github.com/neomjs/neo/blob/dev/resources/scss/theme-light/Global.scss
>
> i did a small change to at least now scope the rules into the root & theme
> selector, but this does not exclude the changes from other themes. in a
> nutshell:
>
> <div class="neo-theme-neo-light">
>     <h1>Foo</h1> // styled
> </div>
>
> <div class="neo-theme-dark">
>     <h1>Bar</h1> // not styled
> </div>
>
> <div class="neo-theme-neo-light">
>     <div class="neo-theme-dark">
>         <h1>Baz</h1> // styled, although it probably should not be
>     </div>
> </div>
>
> —
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/5112#issuecomment-2185270562>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/ADSPIRN75AB6TMO42F6DD5LZI4LL7AVCNFSM6AAAAABJYTHQAGVHI2DSMVQWIX3LMV43OSLTON2WKQ3PNVWWK3TUHMZDCOBVGI3TANJWGI>
> .
> You are receiving this because you authored the thread.Message ID:
> ***@***.***>
>


### @tobiu - 2024-06-24T08:56:37Z

the related change you mention is this commit (i did more changes to weaken the side-effects of the new theme):
https://github.com/neomjs/neo/commit/47bf2ee278c851711735d97474b5936ec03c29ad

the basic tag styles were top level and not scoped to the theme itself.

this is very dangerous: imagine you have 3 apps build with 3 different libs / frameworks and one of them overrides the styling of the others. must not happen.

one of the reasons shadow dom got invented to prevent any influences from outside (mostly due to non-scoped styling). shadow dom has other issues though, like each node needs to load all required style rules (CSS) again => file size & especially memory usage are bad.

in short: what you probably want is support for basic tag styling for the other 2 themes, which would be a new feature request ticket.

- 2024-08-31T08:45:02Z @tobiu closed this issue

