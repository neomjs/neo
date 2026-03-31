# Setting up the AI Development Environment on Windows with WSL

> **IMPORTANT NOTE:** The Neo.mjs framework runs perfectly on native Windows. This guide is **only** for setting up the AI development environment, which includes tools like the local Knowledge Base and Memory Core. These tools rely on the ChromaDB vector database, which has a known installation issue on native Windows (see [chroma-core/chroma#5188](https://github.com/chroma-core/chroma/issues/5188)).
> 
> The following instructions use the Windows Subsystem for Linux (WSL) as a robust workaround for this third-party dependency issue.

This guide provides a step-by-step walkthrough for setting up your AI development environment on Windows using WSL. This is the recommended approach to avoid a known installation issue with the ChromaDB vector database on native x64 Windows.


## What You'll Need

- Windows 10/11
- About 30 minutes
- A GitHub account with a Neo fork (or you can fork it during setup)

## Why WSL?

Neo uses some Linux-specific tools (like ChromaDB) that work better in a Linux environment. WSL lets you run Linux directly on Windows without needing a separate computer or dual-boot setup. Think of it as having a mini Linux computer inside Windows.

---

## Step 1: Enable Virtualization

WSL needs virtualization turned on. Let's check if it's already enabled.

### Check Current Status

1. Press `Ctrl+Shift+Esc` to open Task Manager
2. Click the **Performance** tab
3. Click **CPU** in the left sidebar
4. Look for **Virtualization** — it should say "Enabled"

**Already enabled?** Great! Skip to Step 2.

### If It Says "Disabled"

You'll need to enable it in your computer's BIOS/UEFI settings. Here's how:

1. **Restart your computer**
2. **As it's starting up**, repeatedly press the key to enter BIOS:
   - Most Dell computers: `F2` or `F12`
   - HP: `Esc` then `F10`
   - Lenovo: `F1` or the Novo button
   - Asus/Acer: `F2` or `Del`

   *Not sure? Google "[your computer brand] enter BIOS" or look for hints on the startup screen*

3. **Find the virtualization setting:**
   - Intel processors: Look for "Intel VT-x" or "Virtualization Technology"
   - AMD processors: Look for "SVM Mode" or "AMD-V"

4. **Turn it on**, then save and exit (usually `F10`)

5. **Verify** it worked by checking Task Manager again

> **Note:** If your computer is managed by a company IT department, you might need their help with this step.

---

## Step 2: Install WSL and Ubuntu

This is surprisingly easy. Open **PowerShell as Administrator** (right-click the Start menu and select it), then run:

```powershell
wsl --install -d Ubuntu
```

That's it! Windows will download and install everything automatically. **Restart your computer** when prompted.

---

## Step 3: Set Up Your Ubuntu User

Launch **Ubuntu** from your Start menu. The first time you open it, you'll create a user account:

1. Enter a **username** (lowercase, no spaces)
2. Create a **password** (you won't see characters as you type—this is normal!)
3. Confirm your password

**Stuck at a weird prompt or getting a root shell?** Run these commands:

```bash
adduser yourusername
usermod -aG sudo yourusername
echo -e "[user]\ndefault=yourusername" | sudo tee /etc/wsl.conf
```

Then close Ubuntu and run this in PowerShell:

```powershell
wsl --shutdown
```

Open Ubuntu again—you should be good now!

---

## Step 4: Install Required Tools

Copy and paste these commands into your Ubuntu terminal. They'll install everything you need:

### Update Ubuntu and Install Basics

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

### Install Node.js (version 20)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Verify everything installed:**

```bash
node -v && npm -v
```

You should see version numbers for both.

---

## Step 5: Get the Neo Code

You have two options here:

### Option A: Clone Your Fork (Recommended for Most People)

```bash
cd ~
git clone https://github.com/YOUR-USERNAME/neo.git
cd neo
```

Replace `YOUR-USERNAME` with your actual GitHub username.

### Option B: Copy Existing Work from Windows

If you already cloned Neo in Windows and have changes you want to keep:

```bash
mkdir -p ~/neo
cp -r /mnt/c/Users/YOUR-NAME/path/to/neo/.* ~/neo/ 2>/dev/null
cp -r /mnt/c/Users/YOUR-NAME/path/to/neo/* ~/neo/
```

Replace the path with where your Neo folder actually is.

---

## Step 6: Open Neo in VS Code

### Install the WSL Extension

1. Open VS Code on Windows
2. Go to Extensions (or press `Ctrl+Shift+X`)
3. Search for "WSL" by Microsoft
4. Click Install

### Open Your Project

Back in your Ubuntu terminal:

```bash
cd ~/neo
code .
```

VS Code will open and install a few things automatically. When it's done, you'll see `WSL: Ubuntu` in the bottom-left corner. **You're now editing files inside Linux!**

---

## Step 7: Configure Git

Tell Git who you are (first time only):

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Use the same email you use for GitHub.

---

## Step 8: Install Project Dependencies

In VS Code's terminal (it should be running WSL/Ubuntu):

```bash
npm install
```

**Getting errors about ChromaDB or esbuild?** Try this:

```bash
npm rebuild chromadb
npm rebuild esbuild
```

Then run:

```bash
npm run build-all
```

---

## Step 9: Start the Development Server

### To run the AI features (with ChromaDB):

```bash
npm run ai:server
```

You should see: `Chroma server running at http://localhost:8000`

**To stop it:** Press `Ctrl+C` in the terminal.

### For regular development (no AI):

```bash
npm run dev
```

---

## Troubleshooting

### "Command not found" errors

Make sure you're running commands in the **Ubuntu terminal**, not Windows Command Prompt or PowerShell.

### ChromaDB won't start

Try rebuilding it:

```bash
npm rebuild chromadb --force
npm install @esbuild/linux-x64 --save-optional
```

### VS Code won't connect to WSL

1. Close VS Code completely
2. In PowerShell: `wsl --shutdown`
3. Open Ubuntu again
4. Try `code .` again

### Still stuck?

Check the project's GitHub Issues or ask in the community Discord/Slack. Include:
- The exact error message you're seeing
- What step you're on
- The output of `node -v` and `npm -v`

---

## Next Steps

Now that you're set up, here's how to contribute:

1. **Find an issue** to work on (look for "good first issue" labels)
2. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and test them
4. **Commit and push:**
   ```bash
   git add .
   git commit -m "Description of your changes"
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** on GitHub

Welcome to the Neo community! 🚀