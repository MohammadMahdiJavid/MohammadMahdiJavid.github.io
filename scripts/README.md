# Scripts

Run these commands from the repository root.

For parallel agent work, read [Single-server agent workflow](../docs/SINGLE_SERVER_AGENT_WORKFLOW.md) and [Multi agent workflow](../docs/MULTI_AGENT_WORKFLOW.md) before editing shared files.

## Multi-agent workflow

One coordinator terminal owns the shared build loop and fixed local endpoint.

```powershell
.\scripts\pages-shared-server.ps1
```

Each agent verifies through that server. Use `-Fast` for output and smoke checks only.

```powershell
.\scripts\agent-verify-shared-pages.ps1 -AgentId agent-01 -Fast
.\scripts\agent-verify-shared-pages.ps1 -AgentId agent-01
```

The shared endpoint is fixed.

```text
http://127.0.0.1:4000
```

In coordinated multi-agent mode, agents should not run `pages-local.ps1`, `build-pages.ps1`, `serve-pages.ps1`, or `verify-pages.ps1` directly against port `4000`.

## Manual workflow

`pages-local.ps1` is the main single-user wrapper.

```powershell
.\scripts\pages-local.ps1 -Mode Build
.\scripts\pages-local.ps1 -Mode Smoke -Port 4000
.\scripts\pages-local.ps1 -Mode Serve -Port 4000
.\scripts\verify-pages.ps1 -SkipBuild -Port 4000
.\scripts\verify-pages.ps1 -Port 4000 -KeepServer
```

`Build` installs dependencies when needed and builds the Jekyll site.

`Smoke` builds, starts a temporary local server, checks key pages and assets, then stops the server.

`Serve` builds and keeps the site running on localhost.

`verify-pages.ps1` runs generated output checks, smoke checks, and browser checks.

## Individual scripts

`pages-env.ps1`

Shared initializer used by every PowerShell script. It resolves the repository root, moves the script process to that root, prepends common Ruby, Python, Node, Chrome, Edge, and Chromium paths to `PATH`, and exposes shared helpers.

`find-browser.ps1`

Finds the browser path used by browser verification.

`setup-pages.ps1`

Checks Ruby, Bundler, and Python. Installs Ruby gems into `vendor/bundle`.

`build-pages.ps1`

Builds the GitHub Pages compatible Jekyll site into `_site`.

`serve-pages.ps1`

Serves the already built `_site` folder on localhost.

`smoke-pages.ps1`

Uses the shared local server helper, verifies the server is serving the current `_site` output, then checks important routes and assets.

`pages-server.ps1`

Shared server helper used by verification scripts. It starts localhost when needed, reuses an existing server only after hash freshness checks pass, and stops only a server it started.

`pages-shared-server.ps1`

Multi-agent coordinator. It builds into a staging directory, publishes into `_site` under an exclusive lock, starts or reuses the fixed server at `http://127.0.0.1:4000`, watches source files, and writes `.agent-runtime\pages-shared-server-status.json`.

`agent-verify-shared-pages.ps1`

Multi-agent verifier. It waits for the coordinator, takes a shared read lock, verifies the current build id, writes agent artifacts under `verification-artifacts\agents`, and never starts its own server.

`verify-pages-output.ps1`

Verifies generated HTML, CSS, and JavaScript tokens after a Pages build.

`verify-browser-pages.ps1`

Runs headless Chrome or Edge visual, DOM, keyboard, console, network, and target size checks. Screenshots and reports are written under `verification-artifacts`.

`verify-visual-artifacts.ps1`

Checks browser screenshots for blank output and compares them with reusable local baselines. Missing baselines are created by the browser verifier under `verification-artifacts\visual-baselines` unless strict baseline mode is requested.

`verify-pages.ps1`

Runs output checks, smoke checks, browser checks, and visual artifact checks as one verification command.

`package-source.ps1`

Creates a transfer zip with source files only. It excludes generated and fetched data such as `_site`, `vendor`, `node_modules`, `.bundle`, and `Gemfile.lock`.

Default output folder

```text
source-packages\
```

Example

```powershell
.\scripts\package-source.ps1
.\scripts\package-source.ps1 -ArchiveName handoff.zip -Force
```

## Example files

Each PowerShell script has a matching `.ps1.example` file next to it.

These files are comment only learning references. Open them to see common command lines, useful options, recommended next commands, and notes. They are safe to open or run because every example command is commented.
