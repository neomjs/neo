---
id: 7305
title: Test and Use the `createExample` Script to Build an `Image` Example
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - Sandy-Legendary-Developer-07
createdAt: '2025-09-28T14:07:14Z'
updatedAt: '2025-10-02T08:53:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7305'
author: tobiu
commentsCount: 6
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Test and Use the `createExample` Script to Build an `Image` Example

**Reported by:** @tobiu on 2025-09-28

---

**Parent Issue:** #7296 - Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

---

This ticket is a hands-on guide to creating a new component example by testing and using our built-in scaffolding tools. Your goal is to create a new, interactive example for `Neo.component.Image`.

This is a high-impact task that tests our developer tooling, creates a new example, and serves as a great learning experience.

### Part 1: Test the `createExample` Script

The framework includes a script to boilerplate new examples, but it needs to be tested.

1.  From the `neo` repository root, run the `createExample` script targeting `Neo.component.Image`. The command should be similar to this:
    ```bash
    node ./buildScripts/tools/createExample.mjs -c Neo.component.Image
    ```
2.  **Document your results:** Does the script run successfully? Does it create a new folder and files in `/examples/component/image/`? Please report any errors or confirm the exact command that worked.

### Part 2: Refine the Generated Example

Assuming the script works, it will generate a `MainContainer.mjs` file with boilerplate configurations.

1.  Open the newly created `examples/component/image/MainContainer.mjs`.
2.  In the `createExampleComponent()` method, set a default `src` for the `Image` instance (you can use any valid image URL).
3.  In the `createConfigurationComponents()` method, remove the boilerplate `height` and `width` fields and add a `TextField` that allows a user to change the `src` property of the `Image` component in real-time. You can look at other examples to see how the `onConfigChange` listener works.

## Comments

### @Sandy-Legendary-Developer-07 - 2025-09-28 14:16

Hi, I'm interested in working on this issue. Could you please assign it to me? Looking forward to contributing!

### @tobiu - 2025-09-28 14:25

Sure. This should be a fun item to work on. Hint: do not submit a PR before october 1st, to ensure it counts for the event.

I am curious: are you planning to try out the "ai native" workflow?

### @Sandy-Legendary-Developer-07 - 2025-09-28 14:33

yes I will try "ai native" workflow, let me go through the content of it and then I will comment in that issue

### @tobiu - 2025-09-28 15:05

Perfect. Feel free to join the Slack or Discord for questions. While the knowledge base is fairly new, the concept in general works like a charm. So far I manually fed Gemini CLI will relevant context, which was an unfair advantage. With the RAG/MCP API now everyone can get to a very advanced level. Explore https://github.com/neomjs/neo/releases how much this can boost productivity.

### @tobiu - 2025-09-29 09:47

I just finished this one:
https://github.com/neomjs/neo/blob/dev/.github/WORKING_WITH_AGENTS.md

Hope it helps!

### @Sandy-Legendary-Developer-07 - 2025-10-02 08:52

I have tested this command, ```node ./buildScripts/tools/createExample.mjs -c Neo.component.Image``` in CLI
## It created four files including MainContainer.mjs 
- I have created a src for the img in MainContainer.mjs file in createExampleComponent() 
- Removed the boiler plate code of height and width in createConfigurationComponents()

```
createConfigurationComponents() {
     let me = this;

     return [{
          module: TextField,
          clearable: true,
          labelText: 'Image Source',
          listeners: { change: me.onConfigChange.bind(me, 'src') },
          style: { marginTop: '10px'},
          value: me.exampleComponent.src,
     }]
}

   createExampleComponent() {
       return Neo.create({
           module: Image,
           height: 425,
           width:  640,
           src: 'https://tse3.mm.bing.net/th/id/OIP.EfEQWL8cbRjd4kRmSiq0SwHaE6?pid=Api&P=0&h=180'
           // property_xy: <value>
       })
   }
}
```

# Result 

<img width="1909" height="899" alt="Image" src="https://github.com/user-attachments/assets/bca33b00-db0c-424d-81ad-cf403f7325af" />


## Could you guide me how to document it? and also do I need to stage the newly created files using that command and commit, then push it , or just the docs needed?

