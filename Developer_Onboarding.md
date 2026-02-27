# SOFAS Extension - Developer Onboarding Guide

Welcome! This guide will walk you through the codebase from zero to understanding how everything works.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What This Extension Does (5 Minutes)](#what-this-extension-does-5-minutes)
3. [How VS Code Extensions Work (10 Minutes)](#how-vs-code-extensions-work-10-minutes)
4. [The Architecture at a Glance (5 Minutes)](#the-architecture-at-a-glance-5-minutes)
5. [Read the Code in This Order](#read-the-code-in-this-order)
6. [Deep Dive: How It All Works](#deep-dive-how-it-all-works)
7. [Common Tasks](#common-tasks)
8. [Debugging & Troubleshooting](#debugging--troubleshooting)

---

## Quick Start

### Get the code running in 2 minutes

```bash
# Clone or open this folder
cd c:\Users\krypton\Desktop\SOFAS

# Install dependencies (minimal - VS Code extension)
npm install

# Press F5 in VS Code to launch the extension in debug mode
# This opens a new VS Code window with SOFAS loaded
```

In the debug window, open the terminal and run:
```bash
npm run test:fail    # Should play "FAAH" sound
npm run test:success # Should play "I GOT THIS" sound
```

Watch the Output panel (`View → Output → "SOFAS Extension Output"`) to see logs.

---

## What This Extension Does (5 Minutes)

**SOFAS** = **S**ound **O**n **FA**il **S**ystem

### The User's Perspective

1. Developer runs tests in VS Code terminal: `npm test`
2. Tests fail (exit code 1)
3. **SOFAS plays a sad sound** to immediately alert them
4. Developer runs tests again after fixing code
5. Tests pass (exit code 0)
6. **SOFAS plays a happy sound** to celebrate
7. Status bar shows pass/fail indicator

### How It Detects Test Execution

SOFAS listens to your terminal in **three independent ways**:

| Detection Method | How it works | When to use |
|---|---|---|
| **Terminal Close** | Monitors when terminal windows close, checks exit code | Fallback, always available |
| **Shell Integration** | Reads actual commands executed with their exit codes | Best method, most reliable |
| **Task Events** | Monitors VS Code's task system completion | For structured test tasks |

The extension watches for known test commands (jest, pytest, cargo test, etc.) and triggers sounds based on exit code.

---

## How VS Code Extensions Work (10 Minutes)

Before reading code, understand this foundation. **Every** VS Code extension has:

### 1. **`package.json`** — The Manifest

This is the **blueprint** that tells VS Code everything about your extension before any code runs.

```json
{
  "name": "sofas-extension",           // npm package name
  "displayName": "SOFAS",              // What shows in marketplace
  "main": "./src/extension.js",        // Where the code lives
  "activationEvents": ["onStartupFinished"],  // When to load
  "contributes": {
    "commands": [...],                 // Commands you provide
    "configuration": [...]             // Settings you define
  }
}
```

**Key insight**: VS Code reads `package.json` first. It doesn't load any code until an activation event fires.

### 2. **`src/extension.js`** — The Code

Must export exactly two functions:

```javascript
// Called when activation event fires
function activate(context) {
  // Initialize everything
  // Register commands
  // Set up listeners
  // This is where SOFAS comes to life
}

// Called when extension unloads
function deactivate() {
  // Optional cleanup
}

module.exports = { activate, deactivate };
```

The `context` object is your lifeline:
- `context.extensionPath` — Where your extension is installed
- `context.subscriptions` — VS Code auto-cleans these up when unloaded

### 3. **`.vscodeignore`** — Exclusion List

Like `.gitignore`, but for what NOT to package into the `.vsix` file (the installable package).

---

## The Architecture at a Glance (5 Minutes)

The entire SOFAS logic lives in **one file**: [`src/extension.js`](src/extension.js)

It's organized into **11 logical sections**:

```
┌─────────────────────────────────────────────────────────┐
│ SECTION 1: Imports & Constants                          │
│ Load modules, define test command list                  │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 2: Global State                                 │
│ Extension path, output channel, status bar, cooldown    │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 3: Utilities                                    │
│ Logging, config reading, file existence checks          │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 4-5: Sound System                               │
│ Find files, resolve paths, platform-specific playback   │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 6: Test Detection                               │
│ Extract commands, check if they're tests                │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 7: Event Listeners                              │
│ Listen to terminal, shell, and task events              │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 8: Callbacks                                    │
│ onTestFailed(), onTestPassed()                          │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 9-10: Commands & UI                             │
│ Register user commands, update status bar               │
└─────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────┐
│ SECTION 11: Activation & Export                         │
│ activate() — entry point where everything starts        │
└─────────────────────────────────────────────────────────┘
```

**Flow**: User runs tests → Event fires → Listener detects → Callback plays sound → UI updates

---

## Read the Code in This Order

### Phase 1: Understand Configuration (10 min)

**File**: [`package.json`](package.json)

Read these sections:
1. `"main"` field — Points to `src/extension.js`
2. `"activationEvents"` — When does VS Code load this?
3. `"contributes.commands"` — What commands are available?
4. `"contributes.configuration"` — What settings can users change?

**Key questions to answer:**
- When does this extension activate?
- What commands does the user have access to?
- What settings control the behavior?

---

### Phase 2: Understand the Entry Point (15 min)

**File**: [`src/extension.js`](src/extension.js) — **SECTION 11 FIRST**

Read the `activate(context)` function and `module.exports` at the very bottom.

**Why read activation first?** It shows you the structure:
- Create output channel
- Create status bar
- Register commands
- Set up listeners
- That's it!

**Key questions to answer:**
- What happens when the extension loads?
- What gets initialized?
- What gets stored globally?

---

### Phase 3: Understand Test Detection (20 min)

**File**: [`src/extension.js`](src/extension.js) — **SECTIONS 6 & 7**

Read in this order:
1. **SECTION 6: Test Command Detection** — `isTestCommand()`, `extractCommand()`
2. **SECTION 7: Event Listeners** — The three listeners

**Why this order?** Listeners are useless if you don't understand detection.

**Key questions to answer:**
- How does the extension know "npm test" is a test?
- What's the difference between exact match and heuristic matching?
- How does shell integration work?

---

### Phase 4: Understand Sound System (20 min)

**File**: [`src/extension.js`](src/extension.js) — **SECTIONS 4 & 5**

Read in this order:
1. **SECTION 4: Sound Resolution** — `getSoundsDirectory()`, `resolveSoundFile()`
2. **SECTION 5: Audio Playback** — `playSound()`, platform-specific functions

**Why this order?** Playback can't happen without resolved files.

**Key questions to answer:**
- Why use `context.extensionPath` instead of `__dirname`?
- How are custom sounds handled vs. built-in?
- Why are there three different audio functions (Windows/macOS/Linux)?
- What happens if a sound file doesn't exist?

---

### Phase 5: Understand Callbacks (10 min)

**File**: [`src/extension.js`](src/extension.js) — **SECTION 8**

Read `onTestFailed()` and `onTestPassed()`.

**Key questions to answer:**
- What happens after a test failure is detected?
- What happens after a test passes?
- Why is cooldown checked? When does it matter?

---

### Phase 6: Polish Details (10 min)

**File**: [`src/extension.js`](src/extension.js) — **SECTIONS 1, 2, 3, 9, 10**

Skim these for understanding:
- **SECTION 1**: What modules are imported? Why?
- **SECTION 2**: What's stored globally? Why not local?
- **SECTION 3**: How is error handling done?
- **SECTIONS 9-10**: Commands and UI updates

---

### Phase 7: Documentation (Read when you need detail)

These files explain the "why" and design decisions:

- **[`REWRITE_DOCUMENTATION.md`](REWRITE_DOCUMENTATION.md)** — Architecture decisions, what problems were fixed
- **[`README.md`](README.md)** — Complete user documentation
- **[`CHANGELOG.md`](CHANGELOG.md)** — What's in version 1.0.0

---

## Deep Dive: How It All Works

### Complete Flow: User Runs Tests

Here's what happens when you run `npm test` in the terminal:

```
1. USER TYPES IN TERMINAL
   $ npm test
   
2. SHELL INTEGRATION DETECTOR FIRES
   vscode.window.onDidExecuteTerminalCommand event
   
3. EXTENSION EXTRACTS COMMAND
   commandLine = "npm test"
   extractCommand("npm test") → "npm test"
   
4. EXTENSION CHECKS IF IT'S A TEST
   isTestCommand("npm test") → checks known commands
   Finds "npm test" in DEFAULT_TEST_COMMANDS
   Returns true
   
5. TEST RUNS (user sees output in terminal)
   
6. PROCESS EXITS WITH CODE
   npm test returns 0 (success) or 1 (failure)
   
7. SHELL INTEGRATION PROVIDES EXIT CODE
   event.exitCode = 1 (failure example)
   
8. EXTENSION DECIDES WHAT TO DO
   If exitCode !== 0:
     → Call onTestFailed()
   If exitCode === 0:
     → Call onTestPassed()
   
9. onTestFailed() EXECUTES
   a) Check if enabled (config value)
   b) Check cooldown (prevent spam)
   c) Update status bar to show "$(warning) SOFAS"
   d) Call playSound('fail')
   e) Show notification message
   f) Reset status bar after 5 seconds
   
10. playSound('fail') EXECUTES
    a) Check if extension enabled
    b) Resolve sound file:
       - Check custom path (user-specified file)
       - Fall back to config value ('faah' or 'pleasespeed')
       - Build absolute path using extensionPath
       - Validate file exists
    c) Get volume from config
    d) Detect platform (Windows/macOS/Linux)
    e) Call platform-specific player:
       - Windows: PowerShell MediaPlayer
       - macOS: afplay command
       - Linux: mpg123, ffplay, or paplay
    
11. SOUND PLAYS
    User hears "FAAH" sound 🔊
```

### Key Decision Points

**Q: Why use `context.extensionPath`?**
A: When the extension is packaged into a `.vsix` and installed, `__dirname` points to `~/.vscode/extensions/krypton.sofas-extension-xxx/src/`, not the root. Calculating `path.join(__dirname, '..', 'sounds')` would be fragile. Instead, VS Code gives us the exact installed extension path via `context`, which is reliable.

**Q: Why three separate audio functions?**
A: Each OS has different built-in tools:
- Windows: No native command-line audio, but PowerShell can use .NET classes
- macOS: Has `afplay` built-in
- Linux: Multiple players, try each in order

**Q: Why check cooldown?**
A: If a user runs tests every 2 seconds in a loop, we'd play 30 sounds per minute. Annoying! Cooldown prevents this.

**Q: Why heuristic matching?**
A: Some tests run as `npm run test:fail` (custom npm script). We can't hardcode every possible script name, so we check: if it contains "test" AND contains "npm", it's probably a test.

---

## Common Tasks

### Add Support for a New Test Command

**Scenario**: Your team uses a custom test runner called `unicorn-test`.

**Steps**:

1. Open [`src/extension.js`](src/extension.js) → **SECTION 1**
2. Find `DEFAULT_TEST_COMMANDS` array
3. Add `'unicorn-test'` to the list:

```javascript
const DEFAULT_TEST_COMMANDS = [
  // ... existing commands ...
  'jest', 'vitest', 'pytest',
  'unicorn-test',  // ← ADD HERE
  // ... more commands ...
];
```

4. Test it reloads and works:
```bash
npm run package
# Then install in VS Code
```

Alternatively, users can add it themselves via settings:
```json
{
  "sofasOnFail.extraTestCommands": ["unicorn-test"]
}
```

---

### Change the Built-in Sounds

**Scenario**: You want to use different audio files.

**File**: [`sounds/README.md`](sounds/README.md) has instructions

**Steps**:

1. Replace audio files in `sounds/` folder
2. Keep the filename format: `faah.mp3`, `pleasespeed.mp3`, `igotthis.mp3`, etc.
3. Or update references in [`src/extension.js`](src/extension.js) → **SECTION 4** `resolveSoundFile()` if you want different names

---

### Add a New Configuration Setting

**Scenario**: You want users to choose a "vibe" (serious/silly/motivational).

**Steps**:

1. **Add to [`package.json`](package.json)** → `contributes.configuration.properties`:

```json
{
  "sofasOnFail.vibe": {
    "type": "string",
    "default": "neutral",
    "enum": ["serious", "silly", "motivational"],
    "description": "What vibe should sounds convey?"
  }
}
```

2. **Read it in [`src/extension.js`](src/extension.js)** → **SECTION 5** in `playSound()`:

```javascript
const vibe = getConfigValue('vibe', 'neutral');
log(`Playing sound with vibe: ${vibe}`);
```

---

### Debug Why Sounds Aren't Playing

**Steps**:

1. Open the debug version:
   ```bash
   F5  # In VS Code
   ```

2. In the debug window, open Output:
   ```
   View → Output → "SOFAS Extension Output"
   ```

3. Run a test:
   ```bash
   npm run test:fail
   ```

4. Watch the logs. They'll tell you exactly where it failed:
   ```
   [10:45:32 AM] [onDidExecuteTerminalCommand] "npm run test:fail" → exit code: 1
   [10:45:32 AM] [isTestCommand] Matched known command: "npm run test:fail"
   [10:45:32 AM] [onTestFailed] Test run failed!
   [10:45:32 AM] [playSound] Called with type: 'fail'
   [10:45:32 AM] [resolveSoundFile] Fail sound: C:\...\sounds\faah.mp3 (exists: true)
   [10:45:32 AM] ✓ Audio played successfully (Windows)
   ```

If you see "exists: false", the audio file is missing.
If you don't see "[onDidExecuteTerminalCommand]", shell integration isn't active.

---

## Debugging & Troubleshooting

### VS Code Seems Cached (Running Old Code)

**Problem**: You make a change but the old behavior still happens.

**Solution**:
```bash
# Uninstall old extension
code --uninstall-extension krypton.sofas-extension

# Delete the existing installation
rm -r ~/.vscode/extensions/krypton.sofas-extension-*

# Reinstall fresh
npm run package
code --install-extension sofas-extension-1.0.0.vsix
```

### New Output Channel Isn't Appearing

**Problem**: You see "SPLAT on Fail" or "SOFAS on Fail" (old names).

**Solution**: The old output channel is cached.

```bash
# Force clear all extensions
code --uninstall-extension krypton.sofas-extension

# Kill VS Code processes
# Restart VS Code
```

### Sounds Play But You Can't Hear Them

**Checklist**:
- [ ] Is volume turned up? (`sofasOnFail.volume: 0.7`)
- [ ] Do other sounds work on your system?
- [ ] Are speakers connected/unmuted?
- [ ] Did you test via the command? (`sofasOnFail.testSound`)
- [ ] Are the `.mp3` files in `sounds/` folder? (Check file explorer)

**Debug**:
```bash
# Test on your OS directly
# Windows:
powershell -Command "Add-Type -AssemblyName presentationCore; \$p = New-Object System.Windows.Media.MediaPlayer; \$p.Open([uri]'file:///C:/path/to/sound.mp3'); \$p.Volume = 0.7; \$p.Play(); [System.Threading.Thread]::Sleep(3000);"

# macOS:
afplay /path/to/sound.mp3

# Linux:
mpg123 /path/to/sound.mp3
```

---

## Next Steps

1. ✅ You've understand the overall architecture
2. ✅ You know which files to read and why
3. ✅ You can trace how test execution → sound playback works

**Now**:
- Open [`src/extension.js`](src/extension.js)
- Read **SECTION 11** first (activation)
- Then work backwards through the guide
- Run it with F5 and experiment

**Questions?**
- Check [`REWRITE_DOCUMENTATION.md`](REWRITE_DOCUMENTATION.md) for design decisions
- Read the inline comments in [`src/extension.js`](src/extension.js) — they explain the "why"
- Look at [`README.md`](README.md) for user-facing behavior

Happy coding! 🎉

---

*This onboarding guide is designed to get you productive in 30 minutes. The extension is intentionally simple and well-documented.*