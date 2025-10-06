## GitHub CLI Setup

### Overview
This guide explains how to set up the GitHub CLI using a Personal Access Token (PAT). It enables automattion of common repository tasks securely, such as reading issues, commenting on PRs, and checking out branches.
By following the steps below, you ensure secure authentication while adhering to the principle of least privilege.

### Personal Access Tokens (PATs)

GitHub provides **Fine-Grained PATs**, which are **repository-specific tokens** that allow limiting actions (such as viewing issues or commenting on PRs).

> Fine-grained PATs are recommended for security and follow the principle of least privilege, giving the token only the minimum scopes it needs to perform specific actions.

### Creating a Fine-Grained PAT

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens → Generate new token**.  
2. Provide a **name** for the new token.  
3. Add a **description** and set an **expiration date**.  
4. Select the **repository** so the token is limited to that repository.
5. Add the permissions required for your workflow. An example set of permissions for using the GitHub CLI can look like:

    | Resource      | Level           | Notes / Why Needed |
    |---------------|----------------|------------------|
    | Contents      | Read           | Required to fetch repository files and PR branches |
    | Issues        | Read & Write   | Required to list, view, create, and comment on issues |
    | Pull requests | Read & Write   | Required to view PR metadata and comment on PRs |

    > The exact permissions may vary depending on the actions you want to perform. Only grant the minimum required scopes. 

6. Click **Generate token** and copy it securely.

### Setting the GH_TOKEN Environment Variable
Set the token in the environment so the CLI can authenticate: 

**Linux / macOS (bash/zsh):**

```bash
export GH_TOKEN="your_fine_grained_token_here"
```

**Windows Powershell:**
```powershell
$env:GH_TOKEN = "your_fine_grained_token_here"
```

### Verify authentication
Run the following command to confirm your setup:
```bash
gh auth status
```
You should see your account recognized along with token and permissions.


