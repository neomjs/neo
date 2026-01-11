---
id: 3995
title: window.moveTo is not reliable for Multi-Screen apps
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-02-06T13:15:59Z'
updatedAt: '2025-08-25T13:25:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3995'
author: Dinkh
commentsCount: 14
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-12-13T02:46:31Z'
---
# window.moveTo is not reliable for Multi-Screen apps

I am currently working on a Multi-Screen Multi-Window app.

Moving a window (moveTo()) on a second screen resizes the window, depending on the DPI for the app-screen and the screen with the window.
If the DPI of the screen with the window is higher, the window gets bigger and vice versa.

Workaround: right befor I use moveTo() I set the size of the window:
```
    let curWindow = this.windowMap.get(data.name);

    curWindow.resizeTo(curWindow.keepSize. width,curWindow.keepSize.height);
    curWindow.moveTo(position.left, position.top);
```


This might be especially interesting to  @michaelwasserman and @quisquous and @tomayac

## Timeline

- 2023-02-06T13:15:59Z @Dinkh added the `bug` label
### @tomayac - 2023-02-06T15:05:39Z

Thanks for the feedback. I'm not entirely sure I'd count this as a bug. FWIW, the same behavior happens with native apps, where, when you move apps between screens with different resolution, the window size seemingly changes. I have seen developers deal with this by setting a scaling factor at the operating system level, for example, for [Windows 10](https://www.alphr.com/microsoft/microsoft-windows-10/1001272/how-to-set-display-scaling-in-windows-10/#:~:text=What%20Does%20Windows%2010%20Scaling%20Do%3F). Your app taking care of this scaling at the browser level might actually make things worse. @michaelwasserman may have more background there.

### @Dinkh - 2023-02-07T08:37:52Z

It seems to me like an error, calling moveTo and at the same time get a scaling for free ;)

### @michaelwasserman - 2023-02-07T18:42:30Z

It would be great to have a clearer minimal repro, including OS and display configuration info to investigate.
Each OS/WM has slightly different behavior when it comes to per-display DPI differences.

Tangentially related: http://crbug.com/1306895 Window Placement: Synchronous moveTo and resizeTo calls do not switch displays - A sync JS call to moveTo|By() after resizeTo|By() (or vice versa) uses estimated pending bounds in the renderer process (adjusted for anticipated placement constraints) from the first call. I've begun exploring improved estimates of adjustments based on window-management permission status, but waiting for the OS/WM and browser to ack the resulting bounds of each bounds adjustment is the most reliable way to move *and* resize a window right now. Even better would be a window.setBounds() web platform API or similar, to specify resize and move requests simultaneously.

### @tobiu - 2023-02-07T19:44:08Z

Hi guys,

Thanks for looking into this! Torsten is working on a super cool demo at the moment. The goal is to drag in-app dialogs outside of the browser viewport. As soon as a dialog is passing the border, it will get converted into a popup and doing so keeps the drag operation alive => you can just move the mouse further without the need to click on the new window again.

I am pretty sure that he will put this online once finished, so that you can test it :)

Sadly I am not involved in this use case. I am working on a massive neo based government project with a tight deadline right now.

Best regards,
Tobi

### @michaelwasserman - 2023-02-09T00:43:46Z

Feel free to share more details or demo when available, we're happy to investigate if something really seems broken.

### @github-actions - 2024-08-29T02:27:44Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:44Z @github-actions added the `stale` label
### @tomayac - 2024-08-29T10:27:10Z

Is this still an issue? @michaelwasserman's offer to help still stands (sorry for speaking on your behalf, Mike, but I'm sure it does).  

- 2024-08-30T02:27:03Z @github-actions removed the `stale` label
### @tobiu - 2024-08-30T16:12:43Z

@tomayac @michaelwasserman: thanks for your input! appreciated.

I just added a GH Action for flagging stale tickets:
https://github.com/neomjs/neo/blob/dev/.github/workflows/cose-inactive-issues.yml

Got over 400 emails. Need to change my notification settings :P

@Dinkh: Torsten, I am not involved in your demo app. How is the progress? => do you still need help with `moveTo()`?

Off Topic: We have been working a lot on the new neo framework website, which itself is a multi-window app:
https://neomjs.com/dist/production/apps/portal/#/home
 
![Screenshot 2024-08-19 at 18 41 48](https://github.com/user-attachments/assets/5f7cea14-83bd-406b-92fc-9d58c79b4e11)

![Screenshot 2024-08-30 at 16 58 35](https://github.com/user-attachments/assets/f10f861e-f1cd-455b-aad4-936c56d736c8)

I guess this would be a very good fit now to try the window placement API => we could allow users to store specific window positions inside the `localStorage` and re-apply. We can open a new feature request ticket for it, if you like to.

Best regards,
Tobias

### @github-actions - 2024-11-29T02:42:47Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-11-29T02:42:48Z @github-actions added the `stale` label
### @github-actions - 2024-12-13T02:46:30Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-12-13T02:46:31Z @github-actions closed this issue
### @tobiu - 2025-07-26T13:22:59Z

@Dinkh @tomayac @michaelwasserman 

Now that Neo v10 is finished => pretty much the birth of a new framework, while being fully backwards-compatible:
https://github.com/neomjs/neo/blob/dev/learn/blog/v10-post1-love-story.md

i do have time to deep-dive into the Window Management API:
https://youtu.be/8oEmN4nfX-s

The PoC, that we can now use in-app drag&drop to move popup windows is in place => kudos on your work.
Meaning: We can now detach entire component trees into popups and just move them, without a drag OP interruption, anywhere.

I made the bold statement, that Neo is "the framework for AI", and now it is time to deliver on this promise:

<img width="1061" height="1643" alt="Image" src="https://github.com/user-attachments/assets/7c3d30f6-99bc-4afd-a7ef-89e6925a3f31" />

This is a one-day PoC, to create a neo-middleware (express, websocket cons, neo core inside nodejs), creating a vector based knowledge base (ChromaDB), integrating the Gemini API, allowing user queries to to ping the middleware, creating a meaningful prompt instruction and generating the prompt.

My next step is to combine it with the Window Management API => drag-detaching widgets and move them outside the main window. If you like, I can keep you posted on the progress of creating a browser-based multi-window IDE with full AI integration.

Sadly, I can not release this one as open source, since there is literally zero support for R&D based projects anymore.

Best regards,
Tobi

### @tobiu - 2025-08-21T23:17:07Z

@Dinkh @tomayac @michaelwasserman 
https://youtu.be/avmv818-o7A

this part was more fun than i thought. uninterrupted widget to popup & back dragging.

### @tomayac - 2025-08-22T10:57:29Z

> [@Dinkh](https://github.com/Dinkh) [@tomayac[<img alt="" width="15" height="15" src="chrome-extension://dlebflppeeemcdpidccbiblndppbmjmh/ospo-chrome-ext-logo.png">](https://teams.googleplex.com/tsteiner@google.com)](https://github.com/tomayac) [@michaelwasserman[<img alt="" width="15" height="15" src="chrome-extension://dlebflppeeemcdpidccbiblndppbmjmh/ospo-chrome-ext-logo.png">](https://teams.googleplex.com/msw@google.com)](https://github.com/michaelwasserman) https://youtu.be/avmv818-o7A
> 
> this part was more fun than i thought. uninterrupted widget to popup & back dragging.

Wow, that's really neat! Congratulations! 

### @michaelwasserman - 2025-08-25T13:25:35Z

+100, very nice!!


