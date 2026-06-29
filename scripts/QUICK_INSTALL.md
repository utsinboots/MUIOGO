# Quick install

One command takes you from a clean machine to a running MUIOGO. The only pre-requisite is **git**; the installer adds `uv`, which brings the right Python and every dependency with it.

You can run it two ways — paste a one-line command, or download the script and run it. Both do the same thing.

## Option 1 — One line

### macOS / Linux

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/EAPD-DRB/MUIOGO/main/scripts/install.sh)"
```

### Windows (PowerShell)

```powershell
$f = "$env:TEMP\muiogo-install.ps1"; irm https://raw.githubusercontent.com/EAPD-DRB/MUIOGO/main/scripts/install.ps1 -OutFile $f; powershell -ExecutionPolicy Bypass -File $f
```

(On Windows the installer is saved to a temp file and run from there, so it executes as a normal script.)

## Option 2 — Download, then run

Handy if you'd rather read the script first, or keep it to re-run later.

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/EAPD-DRB/MUIOGO/main/scripts/install.sh -o install.sh
bash install.sh
```

### Windows (PowerShell)

```powershell
Invoke-WebRequest -UseBasicParsing -Uri https://raw.githubusercontent.com/EAPD-DRB/MUIOGO/main/scripts/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

## What it does

1. Checks that git is installed (and tells you how to install it if it isn't).
2. Installs `uv` if it isn't already present (~5 MB, no admin needed).
3. Clones MUIOGO.
4. Runs `uv sync` — installs the right Python and all dependencies into a local `.venv`.
5. Platform setup — installs the GLPK and CBC solvers, downloads the demo data, creates the app secret key, and verifies everything.

It's safe to re-run: if MUIOGO is already there, it offers to update with `git pull` instead of cloning again.

## Options / skipping prompts

These work with either method above:

- `--dest DIR` / `-Dest` — parent folder to install into (MUIOGO is cloned as a subfolder). Default: current directory.
- `--branch BRANCH` / `-Branch` — install a non-default branch (for testing a fork or PR).
- `--repo-url URL` / `-RepoUrl` — clone from a different repository URL.
- `--yes` / `-Yes` — accept all prompts (non-interactive).
- `--no-demo-data` / `-NoDemoData` — skip the demo-data download.
- `--skip-uv-install` / `-SkipUvInstall` — assume `uv` is already installed.
- `--log` / `-Log` — write an install log file.

```bash
# macOS / Linux — install into ~/Projects/MUIOGO, no prompts
bash install.sh --dest ~/Projects --yes
```
```powershell
# Windows — install into C:\Users\<you>\Projects\MUIOGO, no prompts
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dest C:\Users\$env:USERNAME\Projects -Yes
```

## After install

```bash
# macOS / Linux
cd <destination>/MUIOGO
uv run python API/app.py
```
```powershell
# Windows
cd <destination>\MUIOGO
uv run python API\app.py
```

Then open <http://127.0.0.1:5002/> in your browser. (The installer also offers to start it for you at the end.)
