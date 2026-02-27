# SOFAS

> Plays satisfying sounds when your tests pass or fail. Because silence is worse than the truth.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [How VS Code Extensions Work](#how-vs-code-extensions-work)
3. [Project Structure Explained](#project-structure-explained)
4. [How This Extension Works (Deep Dive)](#how-this-extension-works-deep-dive)
5. [Installation](#installation)
6. [Configuration Reference](#configuration-reference)
7. [Supported Frameworks](#supported-frameworks)
8. [Custom Sounds](#custom-sounds)
9. [Adding Your Own Test Commands (Bash, Git, etc.)](#adding-your-own-test-commands)
10. [Commands](#commands)
11. [Building & Publishing](#building--publishing)
12. [How to Create Your Own VS Code Extension](#how-to-create-your-own-vs-code-extension)
13. [Troubleshooting](#troubleshooting)

---

## What It Does

SOFAS listens to your terminal. When a test command exits with a
non-zero code (the universal signal for failure), it plays a sound — so
you can't silently scroll past a broken build.

**Optionally**, it can also play a success sound so you know when everything
passes without having to look.

---

## How VS Code Extensions Work

Before diving into this extension specifically, here's the big picture of
how any VS Code extension works. This will make everything else make sense.

### The Three Core Files Every Extension Needs

**1. `package.json` — The Manifest**

This is the most important file. VS Code reads it to understand everything
about your extension before loading any code. It tells VS Code:

- What your extension is called and who made it
- Which version of VS Code it needs (`engines.vscode`)
- When to load your extension (`activationEvents`)
- What commands, settings, and UI elements you contribute (`contributes`)
- Where your code lives (`main`)

```json
{
  "name": "my-extension",
  "displayName": "My Extension",
  "main": "./src/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [{ "command": "myExt.hello", "title": "Say Hello" }]
  }
}
```

**2. `src/extension.js` (or `extension.ts`) — The Code**

This is your actual JavaScript (or TypeScript). It must export exactly two
functions:

```javascript
function activate(context) {
  // Called when VS Code loads your extension
  // Register commands, set up listeners, etc.
}

function deactivate() {
  // Called when VS Code unloads your extension
  // Clean up resources
}

module.exports = { activate, deactivate };
```

The `context` object is your lifeline. You push disposable subscriptions
onto `context.subscriptions` — VS Code automatically cleans them up when
the extension is deactivated.

**3. `.vscodeignore` — What to Exclude When Publishing**

Like `.gitignore`, but for what NOT to include in your published `.vsix`
package. You typically exclude source maps, test files, and dev dependencies.

### The VS Code API

Inside `activate()`, you have access to the `vscode` module — a rich
library that lets you:

- Show messages: `vscode.window.showInformationMessage('Hello!')`
- Read/write files: `vscode.workspace.fs`
- Listen to events: `vscode.window.onDidCloseTerminal(...)`
- Read settings: `vscode.workspace.getConfiguration('myExt')`
- Create status bar items, webviews, tree views, and more

### Extension Activation

Extensions don't load immediately when VS Code starts (that would be slow).
Instead, you declare when your extension should wake up. Common triggers:

| `activationEvent`          | When it fires                                    |
|---------------------------|--------------------------------------------------|
| `onStartupFinished`        | After VS Code has fully started (most common)    |
| `onCommand:myExt.hello`    | When the user runs your command                  |
| `onLanguage:python`        | When a Python file is opened                     |
| `workspaceContains:**/*.ts`| When the workspace has TypeScript files          |
| `*`                        | Immediately — only use if absolutely necessary   |

---

## Project Structure Explained

```
SOFAS/
│
├── package.json          ← The manifest (VS Code reads this first)
│
├── src/
│   └── extension.js      ← All the extension logic lives here
│
├── sounds/
│   ├── faah.mp3         ← Built-in fail sounds
│   ├── pleasespeed.mp3
│   ├── igotthis.mp3          ← Built-in success sounds
│   ├── hiphopbeat.mp3
│   └── README.md         ← Instructions for getting audio files
│
├── images/
│   └── OFAAX40.jpg         ← Extension icon shown in marketplace
│
├── .vscodeignore         ← Files to exclude when packaging
└── README.md             ← This file
```

### Why `sounds/` is in the root, not `src/`

The `sounds/` folder is a static asset — it doesn't contain code, just
audio files. Keeping it separate makes it clear what's code vs. resources,
and makes it easier to point people to "drop your files here."

---

## How This Extension Works (Deep Dive)

The extension detects test failures using two independent mechanisms.
Using both gives the broadest possible coverage across different workflows.

### Mechanism 1: Terminal Close Events

VS Code fires an event whenever a terminal closes. The event includes the
terminal's exit code. If the exit code is non-zero and the terminal's name
matches a known test command, the extension fires.

```javascript
vscode.window.onDidCloseTerminal(terminal => {
  const exitCode = terminal.exitStatus?.code;
  const name = terminal.name;

  if (exitCode !== 0 && looksLikeTestCommand(name)) {
    onTestFailed();
  }
});
```

**Limitation:** The terminal name is often the shell (`bash`, `zsh`) rather
than the command that ran in it. This is where Mechanism 2 helps.

### Mechanism 2: Shell Integration (onDidExecuteTerminalCommand)

VS Code's shell integration API (available when shell integration is enabled)
lets the extension see the actual command line that was executed, along with
its exit code. This is much more reliable than terminal names.

```javascript
vscode.window.onDidExecuteTerminalCommand(event => {
  const { commandLine, exitCode } = event;

  if (exitCode !== 0 && looksLikeTestCommand(commandLine)) {
    onTestFailed();
  }
});
```

This is the preferred detection method. It reads the exact command you typed.

### Mechanism 3: Task Exit Codes

VS Code has a Task system for running build/test jobs. The extension listens
for tasks in the `Test` group to complete with a non-zero exit code.

```javascript
vscode.tasks.onDidEndTaskProcess(event => {
  const { exitCode, execution: { task } } = event;
  const isTestTask = task.group === vscode.TaskGroup.Test;

  if (isTestTask && exitCode !== 0) {
    onTestFailed();
  }
});
```

### How Exit Codes Work

This is the fundamental concept the whole extension is built on. When any
program finishes running, it returns a number to the operating system:

- `0` means success — everything went fine
- Any other number (1, 2, 127, etc.) means something went wrong

Test runners all follow this convention:
- `jest` exits `0` if all tests pass, `1` if any fail
- `pytest` exits `0` if all tests pass, `1` if any fail
- `cargo test` exits `0` if all tests pass, `101` if any fail

Your shell scripts should do the same:
```bash
if [ $FAIL -gt 0 ]; then
  exit 1  # Non-zero = failure = SOFAS 
fi
exit 0    # Zero = success
```

### The `looksLikeTestCommand` Function

This function checks whether a string contains a known test command:

```javascript
function looksLikeTestCommand(str) {
  const lower = str.toLowerCase().trim();
  const allCommands = [
    ...DEFAULT_TEST_COMMANDS,
    ...getConfigValue('extraTestCommands', []),
  ];
  return allCommands.some(cmd => {
    const c = cmd.toLowerCase().trim();
    return lower === c || lower.startsWith(c + ' ') || lower.includes(c);
  });
}
```

It combines the built-in list with whatever you've added in
`sofasOnFail.extraTestCommands`. Case-insensitive, and matches both exact
commands and commands with arguments (`jest --watch` matches `jest`).

### Cross-Platform Audio Playback

Playing audio from Node.js differs by operating system. The extension
uses the platform's built-in audio tools:

| OS      | Tool       | Why                                          |
|---------|------------|----------------------------------------------|
| macOS   | `afplay`   | Built-in, reliable, supports volume flag     |
| Windows | PowerShell | Uses `System.Windows.Media.MediaPlayer` class |
| Linux   | `aplay` / `paplay` / `ffplay` | Tries each in order    |

```javascript
if (platform === 'darwin') {
  execFile('afplay', ['-v', String(volume), soundFile]);
} else if (platform === 'win32') {
  exec(`powershell -Command "...MediaPlayer..."`);
} else {
  exec(`aplay "${soundFile}" || paplay "${soundFile}" || ffplay ...`);
}
```

### Cooldown System

Without a cooldown, rapidly re-running tests would spam sounds. The
`cooldownSeconds` setting prevents this:

```javascript
const cooldown = getConfigValue('cooldownSeconds', 3) * 1000;
const now = Date.now();

if (now - lastSoundTime < cooldown) {
  return; // Too soon, skip
}
lastSoundTime = now;
```

---

## Installation

### From VS Code Marketplace (once published)

1. Open Extensions panel (`Ctrl+Shift+X`)
2. Search for **SOFAS**
3. Click Install

### From a `.vsix` file (local install)

```bash
code --install-extension sofas-extension-1.0.0.vsix
```

Or: Extensions panel → `...` menu → **Install from VSIX...**

### From source (development)

```bash
git clone https://github.com/you/splat-on-fail
cd splat-on-fail
npm install
```

Then press `F5` in VS Code to open an Extension Development Host window
with the extension loaded.

---

## Configuration Reference

All settings live under the `sofasOnFail` namespace.

Open settings with `Ctrl+,` then search for **SOFAS**, or edit your
`settings.json` directly (`Ctrl+Shift+P` → **Open User Settings JSON**).

| Setting                         | Type    | Default     | Description                                              |
|---------------------------------|---------|-------------|----------------------------------------------------------|
| `enabled`                       | boolean | `true`      | Master on/off switch                                     |
| `failSound`                     | string  | `"faah"`   | Built-in fail sound: `faah`, `pleasespeed`, `random` |
| `successSound`                  | string  | `"none"`    | Built-in success sound: `igotthis`, `hiphopbeat`, `random` |
| `volume`                        | number  | `0.7`       | Volume from `0.1` (whisper) to `1.0` (full broadcast)   |
| `customFailSoundPath`           | string  | `""`        | Path to a `.wav` or `.mp3` — overrides built-in          |
| `customSuccessSoundPath`        | string  | `""`        | Path to a `.wav` or `.mp3` for success                   |
| `showNotification`              | boolean | `true`      | Show failure message popup                               |
| `showSuccessNotification`       | boolean | `false`     | Show success message popup                               |
| `failMessages`                  | array   | *(see below)*| Pool of messages randomly shown on failure              |
| `extraTestCommands`             | array   | `[]`        | Additional commands to watch                             |
| `cooldownSeconds`               | number  | `3`         | Minimum seconds between sounds                           |
| `onlyActiveEditor`              | boolean | `false`     | Only trigger when VS Code is the focused window          |

### Example settings.json

```json
{
  "sofasOnFail.enabled": true,
  "sofasOnFail.failSound": "faah",
  "sofasOnFail.successSound": "igotthis",
  "sofasOnFail.volume": 0.5,
  "sofasOnFail.showNotification": true,
  "sofasOnFail.extraTestCommands": [
    "bash test.sh",
    "./run_tests.sh",
    "git push",
    "git commit",
    "make check"
  ],
  "sofasOnFail.cooldownSeconds": 5,
  "sofasOnFail.failMessages": [
    "The tests have spoken. They're not happy.",
    "Your code has been found guilty.",
    "Achievement unlocked: Breaking things.",
    "Have you tried not breaking things?",
    "Just check your code again."
  ]
}
```

---

## Supported Frameworks

The extension watches for these commands out of the box:

| Category         | Commands watched                                                      |
|-----------------|-----------------------------------------------------------------------|
| JavaScript/TS    | `jest`, `vitest`, `mocha`, `jasmine`, `ava`, `karma`, `cypress`, `playwright`, `npm test`, `yarn test`, `bun test`, `deno test` |
| Python           | `pytest`, `python -m pytest`, `tox`, `nox`, `unittest`               |
| Ruby             | `rspec`, `bundle exec rspec`, `rails test`, `rake test`, `minitest`  |
| Go               | `go test`                                                             |
| Rust             | `cargo test`                                                          |
| Elixir           | `mix test`                                                            |
| Flutter/Dart     | `flutter test`, `dart test`                                           |
| Java/JVM         | `mvn test`, `gradle test`, `gradlew test`, `junit`                   |
| .NET             | `dotnet test`, `nunit`, `xunit`                                       |
| PHP              | `phpunit`, `vendor/bin/phpunit`                                       |
| C/C++            | `ctest`, `make test`                                                  |
| Shell/Bash       | `bash test.sh`, `bash tests.sh`, `./test.sh`, `./run_tests.sh`       |
| Generic          | `make test`, `make check`                                             |

**Don't see yours?** Add it:

```json
{
  "sofasOnFail.extraTestCommands": ["my-custom-runner", "npm run integration"]
}
```

---

## Adding Your Own Test Commands

### Bash test scripts

Make your script exit with code 1 on failure:

```bash
#!/bin/bash

PASS=0
FAIL=0

assert_equals() {
  local description="$1"
  local expected="$2"
  local actual="$3"

  if [ "$expected" = "$actual" ]; then
    echo "✅ PASS: $description"
    ((PASS++))
  else
    echo "❌ FAIL: $description — expected '$expected', got '$actual'"
    ((FAIL++))
  fi
}

# Your tests
assert_equals "addition works"  "4"     "$((2 + 2))"
assert_equals "string compare"  "hello" "hello"

# Exit non-zero on failure — this is what triggers SPLAT
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -gt 0 ] && exit 1
exit 0
```

Then add to settings:
```json
{ "sofasOnFail.extraTestCommands": ["bash test.sh"] }
```

### Git hooks

Add `git push` or `git commit` to the watched commands, then set up a
pre-push hook that runs your tests:

```bash
# .git/hooks/pre-push
#!/bin/bash
npm test       # or pytest, cargo test, etc.
exit $?        # Pass the exit code through to git
```

Now when `git push` is rejected (either by the hook or by the remote),
SOFAS fires. Add to settings:

```json
{ "sofasOnFail.extraTestCommands": ["git push", "git commit"] }
```

---

## Commands

Open the Command Palette with `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
and type **SPLAT** to see all commands.

| Command                               | Description                         |
|---------------------------------------|-------------------------------------|
| `SOFAS: Enable Sound on Test Failure` | Turn it on                          |
| `SOFAS: Disable Sound on Test Failure`| Turn it off (are you sure?)         |
| `SOFAS: Test the Sound `             | Preview your current fail sound     |
| `SOFAS: Test the Success Sound `     | Preview your current success sound  |

The status bar item (bottom-right) shows the current state and doubles as
a shortcut to preview the sound.

---

## Custom Sounds

Replace built-in sounds with any `.mp3` or `.wav` file:

```json
{
  "sofasOnFail.customFailSoundPath": "/Users/you/sounds/wilhelm-scream.mp3",
  "sofasOnFail.customSuccessSoundPath": "/Users/you/sounds/success-fanfare.mp3"
}
```

**Windows paths:** Use forward slashes or escape backslashes:
```json
{
  "sofasOnFail.customFailSoundPath": "C:/Users/you/sounds/fail.mp3"
}
```

**Finding free sounds:**
- [freesound.org](https://freesound.org) — large library, free account
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/) — no account needed
- [mixkit.co/free-sound-effects](https://mixkit.co/free-sound-effects/) — free with attribution

---

## Building & Publishing

### Prerequisites

```bash
npm install -g @vscode/vsce
```

### Package into a `.vsix` file

```bash
cd sofas-on-fail
npm install
vsce package
# Creates: sofas-on-fail-1.0.0.vsix
```

Install the `.vsix` locally:

```bash
code --install-extension sofas-on-fail-1.0.0.vsix
```

### Publish to the VS Code Marketplace

1. Create a publisher account at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
2. Create a Personal Access Token in Azure DevOps
3. Login: `vsce login your-publisher-name`
4. Publish: `vsce publish`

---

## How to Create Your Own VS Code Extension

Here's the complete process from zero to published extension.

### Step 1: Install the scaffolding tools

```bash
npm install -g yo generator-code
```

### Step 2: Generate a starter project

```bash
yo code
```

You'll be asked:
- **Extension type** — choose "New Extension (JavaScript)" to start simple
- **Name** — your extension name
- **Identifier** — the npm-style name (lowercase, hyphens)
- **Description** — what it does
- **Initialize git?** — yes
- **Bundle with webpack?** — no (keep it simple at first)
- **Package manager** — npm

### Step 3: Understand what was generated

```
my-extension/
├── .vscode/
│   └── launch.json      ← Lets you press F5 to run/debug
├── src/
│   └── extension.js     ← Your code goes here
├── package.json         ← The manifest
├── .vscodeignore
└── README.md
```

### Step 4: Run it

Press `F5`. A new VS Code window opens with your extension loaded. Open
the Command Palette in that window and run your command.

### Step 5: Add a setting

In `package.json`, under `contributes.configuration`:

```json
{
  "contributes": {
    "configuration": {
      "title": "My Extension",
      "properties": {
        "myExtension.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable or disable my extension."
        }
      }
    }
  }
}
```

Read it in code:

```javascript
const enabled = vscode.workspace.getConfiguration('myExtension').get('enabled');
```

### Step 6: Listen to terminal events

```javascript
context.subscriptions.push(
  vscode.window.onDidCloseTerminal(terminal => {
    console.log('Terminal closed:', terminal.exitStatus?.code);
  })
);
```

### Step 7: Register a command

In `package.json`:
```json
{
  "contributes": {
    "commands": [{ "command": "myExtension.hello", "title": "Say Hello" }]
  }
}
```

In `extension.js`:
```javascript
context.subscriptions.push(
  vscode.commands.registerCommand('myExtension.hello', () => {
    vscode.window.showInformationMessage('Hello from my extension!');
  })
);
```

### Step 8: Package and publish

```bash
npm install -g @vscode/vsce
vsce package       # Makes a .vsix you can install locally
vsce publish       # Publishes to marketplace (needs account)
```

### Key VS Code API concepts to explore

- **`vscode.window`** — terminals, editors, messages, status bar
- **`vscode.workspace`** — files, configuration, folder info
- **`vscode.commands`** — register and execute commands
- **`vscode.tasks`** — build/test task lifecycle
- **`vscode.languages`** — language features (hover, completion, diagnostics)
- **`vscode.debug`** — debug session lifecycle
- **`vscode.extensions`** — interact with other extensions

---

## Troubleshooting

### No sound plays

1. Run **SOFAS: Test the Sound** from the Command Palette. If that works,
   the extension is running but your test command isn't being detected.
2. Check the **Output** panel (`View → Output`) and select **SOFAS on Fail**
   from the dropdown to see the extension's log.
3. Make sure your test command is in `extraTestCommands` if it's not in
   the built-in list.

### The sound plays but I can't hear it

- Check the `volume` setting — make sure it's above `0.1`
- On Linux, ensure `aplay`, `paplay`, or `ffplay` is installed
- On Windows, make sure PowerShell execution policy allows scripts

### Sound plays too often / not often enough

- Adjust `cooldownSeconds` to change the minimum gap between sounds
- If it's not firing when you expect, open the Output log to see what
  terminal commands and exit codes the extension is seeing

### Shell integration isn't working

Shell integration needs to be enabled in VS Code. Check:
`Settings → Terminal → Shell Integration: Enabled`

Without shell integration, the extension falls back to terminal close
events, which are less precise but still work for most workflows.

### Tests run in a panel (not terminal) aren't detected

This is a VS Code API limitation. The test observation API isn't stable yet.
Most test extensions spawn terminals internally, so coverage is broad —
but extensions that run tests entirely in the Test Results panel may not
be detected. In that case, try running your tests directly in a terminal.

---

## License

MIT — do whatever you want with it.

---

*Built with the same frustrated energy as every developer who silently scrolled past a failing CI build.*
