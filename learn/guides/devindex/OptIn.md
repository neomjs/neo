# Opt-In and Nominations

The **DevIndex** application actively discovers developers across GitHub, but the network is vast. If you or someone you know hasn't been indexed yet, or if you previously opted out and wish to return, we provide automated mechanisms to opt-in or nominate others.

We maintain a strict boundary for privacy: **If a user has explicitly opted out of the DevIndex, they cannot be nominated by a third party.** They must opt back in themselves to verify their intent.

---

## Option 1: The "Quick Star" Opt-In (For Yourself)

The fastest and easiest way to opt yourself into the DevIndex is by temporarily starring our dedicated opt-in repository. This method acts as an automated, cryptographically secure way to verify your identity. **This is absolutely not a "star gathering" mechanism; we explicitly encourage you to remove your star once your opt-in is processed.**

### How it works:
1. **Star the Repository**: Navigate to [neomjs/devindex-opt-in](https://github.com/neomjs/devindex-opt-in) and click the "Star" button.
2. **Automated Processing**: Our backend pipeline runs every hour. It queries the GraphQL API to find new stargazers on this repository.
3. **Queueing**: When our pipeline detects your star:
    - If you were previously on our blocklist (because you opted out), you are **removed from the blocklist**.
    - Your GitHub username is added to our tracking queue.
4. **Evaluation**: The DevIndex Updater will evaluate your profile. If you meet the minimum total contribution threshold, you will be indexed and displayed. If you do not yet meet the bar, you will be removed from the queue, and you are welcome to star the repo again in the future when your contributions have grown.
5. **Un-star (Highly Encouraged)**: After an hour or two, you are free to un-star the repository. The opt-in is permanent (unless you explicitly opt-out later).

---

## Option 2: Issue Templates (For Yourself or Nominating Others)

If you prefer to have a concrete record of your request, or if you want to nominate other developers to be featured, you can use our automated issue templates.

### How it works:
1. **Create an Issue**: Navigate to [neomjs/devindex-opt-in](https://github.com/neomjs/devindex-opt-in/issues/new/choose) and select either the **"DevIndex Opt-In (Myself)"** or **"DevIndex Opt-In (Nominate Others)"** template.
2. **Submit**: Fill out the requested information (like the GitHub usernames of your nominees).
3. **Automated Processing**: Our backend pipeline runs every hour and scans for open issues with the `devindex-opt-in` label.
    - **For Self Requests**: Your identity is verified as the issue author. You are removed from the blocklist (if applicable) and added to the tracking queue.
    - **For Nominating Others**: The pipeline validates that the usernames exist on GitHub. It adds valid users to the tracking queue. **Crucially, it will NOT remove third-party nominees from the blocklist.** If a nominee previously opted out, your nomination is respectfully skipped to honor their privacy.
4. **Confirmation**: The pipeline will leave an automated comment on your issue detailing exactly who was added to the queue, who failed validation (typos), and who was skipped (already opted out), before automatically closing the issue.

---

## The Allowlist (For High-Profile Contributors)

To ensure the DevIndex remains fast and responsive, we cap the total number of indexed users (currently at 50,000). To enforce a strict "Meritocracy", users with the lowest total contributions are periodically pruned when this cap is reached to make room for more active developers.

However, we recognize that some individuals (such as prominent conference speakers, core framework maintainers, or industry leaders) provide immense value to the developer ecosystem, even if their recent raw contribution counts might occasionally dip below the dynamic threshold.

For these specific cases, we maintain a manual **Allowlist**. Users on the allowlist are guaranteed a spot in the DevIndex, regardless of the dynamic threshold, and they do not consume one of the 50,000 organic meritocracy slots.

### How to request Allowlist status:
Because allowlisting bypasses the automated meritocracy, it requires human verification by the maintainer. 
- If you believe you or someone else should be allowlisted, please reach out to us in our **[Discord server](https://discord.gg/6p8paPq)**.