# SOFAS Extension - Rewrite Plan & Architecture

**Date**: February 27, 2026  
**Status**: Complete Rewrite Implementation  
**Purpose**: Fix audio playback issues and improve code maintainability

---

## Table of Contents

1. [Problems in Current Code](#problems-in-current-code)
2. [Rewrite Strategy](#rewrite-strategy)
3. [New Architecture](#new-architecture)
4. [Key Fixes](#key-fixes)
5. [File-by-File Changes](#file-by-file-changes)
6. [New Code Structure](#new-code-structure)
7. [Comments & Documentation Strategy](#comments--documentation-strategy)
8. [Testing & Validation Plan](#testing--validation-plan)
9. [Expected Outcomes](#expected-outcomes)

---

## Problems in Current Code

### 1. **Audio Path Resolution Failure**
- **Issue**: `__dirname` in packaged VSIX doesn't correctly resolve to the `sounds/` folder
- **Root Cause**: When the extension is packaged and installed in `.vscode/extensions/`, the relative path calculation breaks
- **Impact**: `resolveSoundFile()` returns `null`, no sounds play
- **Symptom**: Log shows "No sound file found for type: faah"

### 2. **Shell Command Detection Broken**
- **Issue**: `onDidExecuteTerminalCommand()` fires but the extension doesn't recognize `npm run test:fail` as a test command
- **Root Cause**: Command line format is unclear; the code doesn't properly parse/match the executed command
- **Impact**: Tests run but trigger sounds never fire
- **Symptom**: Terminal command executes with correct exit code, but no functions are called

### 3. **Configuration Not Readable in All Contexts**
- **Issue**: `getConfig().get()` might fail or return undefined in certain lifecycle moments
- **Root Cause**: No error handling or default value fallbacks
- **Impact**: Settings are lost, defaults don't apply
- **Symptom**: Extension silently fails without logging why

### 4. **Debugging Nearly Impossible**
- **Issue**: Old output channel ("SPLAT on Fail") still visible, new code logs don't appear
- **Root Cause**: VS Code caches the old extension; new code isn't running
- **Impact**: Can't tell if changes are taking effect
- **Symptom**: Same old log messages appear even after reinstalling

### 5. **Code Organization & Readability**
- **Issue**: 465 lines of code with unclear sections and minimal comments
- **Root Cause**: Functions mixed together, no clear separation of concerns
- **Impact**: Hard to find bugs, hard to maintain, hard to understand flow
- **Symptom**: Debugging takes hours, fixing one thing breaks another

---

## Rewrite Strategy

### Approach
- **Complete Rewrite** of `src/extension.js` - start fresh
- **Keep All Configuration** - `package.json` is correct, don't touch it
- **Preserve Resources** - keep `sounds/`, `images/`, test scripts, docs
- **Clear Architecture** - organized into logical sections
- **Comprehensive Comments** - explain every function's purpose
- **Defensive Coding** - error handling, validation, defaults everywhere
- **Crystal Clear Logging** - log every decision point

### Key Principle
> Every function should have a clear purpose, realistic parameters, good error handling, and comments explaining what it does and why.

---

## New Architecture

```
src/extension.js (NEW)
│
├─ SECTION 1: IMPORTS & CONSTANTS
│  ├── Required Node.js modules
│  ├── VS Code API import
│  ├── Built-in test commands list
│  └── Configuration constants
│
├─ SECTION 2: GLOBAL STATE
│  ├── Extension context (FIX #1)
│  ├── Output channel for logging
│  ├── Status bar item
│  └── Cooldown tracker
│
├─ SECTION 3: UTILITIES & LOGGING
│  ├── Logger function with timestamp
│  ├── Safe config reader with defaults
│  ├── Path validation
│  └── File existence checking
│
├─ SECTION 4: SOUND RESOLUTION
│  ├── Get extension's sounds directory (FIX #1 - uses context.extensionPath)
│  ├── Resolve sound file path based on config
│  ├── Validate file exists before returning
│  └── Return absolute path or null
│
├─ SECTION 5: AUDIO PLAYBACK
│  ├── Main playSound() dispatcher
│  ├── Windows audio handler (PowerShell)
│  ├── macOS audio handler (afplay)
│  ├── Linux audio handler (multiple players)
│  └── Volume normalization
│
├─ SECTION 6: TEST DETECTION
│  ├── Extract command from command line
│  ├── Check against known test commands
│  ├── Apply heuristic matching (FIX #2)
│  └── Return true/false
│
├─ SECTION 7: EVENT LISTENERS
│  ├── Terminal close listener
│  ├── Shell command listener (FIX #2 - key improvement)
│  ├── Task completion listener
│  └── All with proper error handling
│
├─ SECTION 8: CALLBACKS
│  ├── onTestFailed() handler
│  ├── onTestPassed() handler
│  └── Both check enabled status first
│
├─ SECTION 9: COMMANDS
│  ├── Enable command
│  ├── Disable command
│  ├── Test fail sound command
│  └── Test success sound command
│
├─ SECTION 10: UI UPDATES
│  ├── Update status bar appearance
│  ├── Show user notifications
│  └── Command response messages
│
└─ SECTION 11: ACTIVATION & MODULE EXPORTS
   ├── activate(context) entry point
   ├── deactivate() cleanup
   └── module.exports = { activate, deactivate }
```

---

## Key Fixes

### FIX #1: Audio Path Resolution

**Problem**: `path.join(__dirname, '..', 'sounds')` doesn't work in packaged extension

**Solution**: Use `context.extensionPath` passed during activation:

```javascript
// BEFORE (BROKEN):
const soundsDir = path.join(__dirname, '..', 'sounds');

// AFTER (FIXED):
// In activate(context):
global.extensionPath = context.extensionPath;
const soundsDir = path.join(global.extensionPath, 'sounds');
// This path will be:
// C:\Users\[user]\.vscode\extensions\krypton.sofas-extension-1.0.0\sounds
```

**Why it works**: The `context` object contains the accurate extension installation path, regardless of where code is executed from.

---

### FIX #2: Shell Command Detection

**Problem**: Can't detect `npm run test:fail` when it executes

**Solution**: Implement smart command extraction and heuristic matching:

```javascript
/**
 * Extract the actual command from a full command line
 * "npm run test:fail" → "npm run test:fail"
 * "npm run test:fail --verbose" → "npm run test:fail"
 */
function extractCommand(commandLine) {
  if (!commandLine) return '';
  
  // Get the command up to the first pipe or semicolon
  const parts = commandLine.split(/[|;]/)[0].trim();
  return parts.toLowerCase();
}

/**
 * Check if a string looks like a test command
 * Uses exact matches + heuristic: contains "test" + ("npm" or ".bat" or ".sh")
 */
function isTestCommand(commandLine) {
  const cmd = extractCommand(commandLine);
  
  // Exact match against known commands
  const isExactMatch = DEFAULT_TEST_COMMANDS.some(testCmd => 
    cmd === testCmd.toLowerCase()
  );
  if (isExactMatch) return true;
  
  // Heuristic: contains "test" + runner
  if (cmd.includes('test') && (cmd.includes('npm') || cmd.includes('.bat') || cmd.includes('.sh'))) {
    log(`Detected test command via heuristic: "${cmd}"`);
    return true;
  }
  
  return false;
}
```

**Why it works**: Checks both known commands and patterns, catches `npm run test:*` scripts even if not hardcoded.

---

### FIX #3: Configuration Readers with Defaults

**Problem**: `getConfig().get()` fails or returns null

**Solution**: Wrap with try-catch and always provide defaults:

```javascript
/**
 * Safely read a configuration value with fallback
 * 
 * @param {string} key - Setting key like "sofasOnFail.enabled"
 * @param {*} defaultValue - Fallback if setting not found
 * @returns {*} The config value or default
 */
function getConfigValue(key, defaultValue) {
  try {
    const config = vscode.workspace.getConfiguration('sofasOnFail');
    const value = config.get(key);
    return (value !== undefined && value !== null) ? value : defaultValue;
  } catch (error) {
    log(`Warning: Failed to read config "${key}": ${error.message}`);
    return defaultValue;
  }
}
```

**Why it works**: Try-catch prevents crashes, always returns usable value.

---

### FIX #4: Crystal Clear Logging

**Problem**: Old logs visible, can't tell if new code runs

**Solution**: Unique output channel + aggressive logging:

```javascript
// In activate(context):
outputChannel = vscode.window.createOutputChannel('SOFAS Extension Output');
log('╔════════════════════════════════════════════════════════════════╗');
log('║  SOFAS EXTENSION - FRESH START (NEW CODE)                      ║');
log('╚════════════════════════════════════════════════════════════════╝');
```

**Why it works**: New output channel name is unmistakable, border characters make it impossible to miss.

---

## File-by-File Changes

| File | Action | Details |
|------|--------|---------|
| `src/extension.js` | **REWRITE** | Delete old, create new from scratch |
| `package.json` | **NO CHANGE** | Configuration is correct |
| `test-fail.bat` | **KEEP** | Works properly |
| `test-success.bat` | **KEEP** | Works properly |
| `.vscodeignore` | **KEEP** | Already correct |
| `sounds/` | **KEEP** | All sound files needed |
| `images/` | **KEEP** | Icon needed |
| `README.md` | **KEEP** | User docs |
| `CHANGELOG.md` | **KEEP** | Release notes |
| `REWRITE_DOCUMENTATION.md` | **CREATE** | This file (architecture docs) |
| `sofas-extension-1.0.0.vsix` | **DELETE** | Will regenerate during build |

---

## New Code Structure

### Section 1: Imports & Constants
```javascript
// Load modules
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');
const { platform } = require('os');

// Test commands to recognize
const DEFAULT_TEST_COMMANDS = [ /* ... */ ];
```

### Section 2: Global State
```javascript
// These will be initialized in activate()
let extensionPath = null;      // Path to extension installation
let outputChannel = null;      // VS Code output panel
let statusBarItem = null;      // Status bar button
let lastSoundTime = 0;         // Cooldown tracking
```

### Section 3: Utilities
```javascript
/**
 * Log a message with timestamp to output panel
 * Called throughout code for debugging
 */
function log(message) { /* ... */ }

/**
 * Get config value with fallback
 * Prevents crashes from missing settings
 */
function getConfigValue(key, defaultValue) { /* ... */ }

/**
 * Check if path exists safely
 * Returns boolean, never throws
 */
function fileExists(filePath) { /* ... */ }
```

### Section 4-5: Sound System
```javascript
/**
 * Get the sounds directory inside the extension
 * Uses context.extensionPath for reliability
 * Returns: "C:\Users\user\.vscode\extensions\krypton.sofas-extension-1.0.0\sounds"
 */
function getSoundsDirectory() { /* ... */ }

/**
 * Find the sound file to play
 * type: 'fail' or 'success'
 * Returns absolute path to .mp3 file or null
 */
function resolveSoundFile(type) { /* ... */ }

/**
 * Play audio on Windows using PowerShell MediaPlayer
 * Handles path escaping, volume, waits for playback
 */
function playOnWindows(filePath, volume) { /* ... */ }

/**
 * Play audio on macOS using built-in afplay
 */
function playOnMacOS(filePath, volume) { /* ... */ }

/**
 * Play audio on Linux trying multiple players
 */
function playOnLinux(filePath, volume) { /* ... */ }

/**
 * Main sound playback function
 * Routes to platform-specific handler
 * Checks enabled, cooldown, file existence first
 */
function playSound(type) { /* ... */ }
```

### Section 6: Test Detection
```javascript
/**
 * Extract the command part from a full command line
 * "npm run test:fail --verbose" → "npm run test:fail"
 */
function extractCommand(commandLine) { /* ... */ }

/**
 * Check if this is a test command
 * Uses exact match + heuristic matching
 * Returns true if looks like a test
 */
function isTestCommand(commandLine) { /* ... */ }
```

### Section 7-8: Events & Callbacks
```javascript
/**
 * Called when terminal is closed
 * Checks if it ran a test command
 */
vscode.window.onDidCloseTerminal(terminal => { /* ... */ })

/**
 * Called when shell command executes
 * KEY FIX: This is how we detect npm test scripts
 */
vscode.window.onDidExecuteTerminalCommand(event => { /* ... */ })

/**
 * Handle test failure
 * Play sound, show notification, update UI
 */
function onTestFailed() { /* ... */ }

/**
 * Handle test success
 * Play sound (if enabled), show notification, update UI
 */
function onTestPassed() { /* ... */ }
```

### Section 9-10: Commands & UI
```javascript
// Register four commands for user interaction:
vscode.commands.registerCommand('sofasOnFail.enable', () => { /* ... */ })
vscode.commands.registerCommand('sofasOnFail.disable', () => { /* ... */ })
vscode.commands.registerCommand('sofasOnFail.testSound', () => { /* ... */ })
vscode.commands.registerCommand('sofasOnFail.testSuccessSound', () => { /* ... */ })

/**
 * Update the status bar appearance
 * Shows enabled/disabled, fail/pass state
 */
function updateStatusBar(state) { /* ... */ }

/**
 * Show a user-facing notification
 * Info, warning, or error
 */
function showNotification(type, message) { /* ... */ }
```

### Section 11: Activation & Export
```javascript
/**
 * Extension activation hook
 * Called when VS Code loads the extension
 * Initializes everything needed
 */
function activate(context) {
  // Store context for later use (FIX #1)
  extensionPath = context.extensionPath;
  
  // Create output channel
  outputChannel = vscode.window.createOutputChannel('SOFAS Extension Output');
  
  // Register all commands
  // Register all listeners
  // Create status bar
  // Log that we're ready
}

/**
 * Extension deactivation hook
 * Called when VS Code unloads the extension
 * Cleanup happens automatically (context.subscriptions)
 */
function deactivate() {
  if (outputChannel) outputChannel.appendLine('Extension deactivated');
}

module.exports = { activate, deactivate };
```

---

## Comments & Documentation Strategy

### Every Function Gets
1. **JSDoc comment** - What it does, params, returns
2. **Purpose explanation** - Why this function exists
3. **Step-by-step comments** - How the logic works
4. **Error handling** - What goes wrong and why

Example:
```javascript
/**
 * Safely read a VS Code configuration value
 * 
 * The VS Code settings API can throw errors in certain contexts,
 * and we want to ensure the extension continues working even if
 * a setting is missing or corrupted.
 * 
 * @param {string} key - The setting key without "sofasOnFail." prefix
 * @param {*} defaultValue - What to return if setting is not found
 * @returns {*} The configured value, or defaultValue if not found
 * 
 * @example
 *   getConfigValue('enabled', true)  // Returns true if setting found, else true
 *   getConfigValue('volume', 0.7)    // Returns volume or 0.7 default
 */
function getConfigValue(key, defaultValue) {
  try {
    const config = vscode.workspace.getConfiguration('sofasOnFail');
    const value = config.get(key);
    
    // Return the value if found and not null/undefined
    if (value !== undefined && value !== null) {
      return value;
    }
    
    // Fallback to default
    return defaultValue;
  } catch (error) {
    // If reading config fails, log and return default
    log(`⚠ Failed to read config key "${key}": ${error.message}`);
    return defaultValue;
  }
}
```

### Inline Comments Explain Logic
```javascript
function playSound(type) {
  // Check if extension is enabled - if not, skip everything
  if (!getConfigValue('enabled', true)) {
    log('Sound playback disabled in settings');
    return;
  }
  
  // Enforce cooldown - prevent sound spam during rapid test reruns
  const cooldown = getConfigValue('cooldownSeconds', 3) * 1000;
  if (Date.now() - lastSoundTime < cooldown) {
    log('Skipped sound: still in cooldown period');
    return;
  }
  lastSoundTime = Date.now();
  
  // ... rest of logic
}
```

---

## Testing & Validation Plan

After rewrite is complete:

### Phase 1: Build
- [ ] Run `npm run package -- --allow-missing-repository`
- [ ] Verify no errors, VSIX created successfully
- [ ] Confirm sounds/ folder included in package

### Phase 2: Clean Install
- [ ] Uninstall all existing SOFAS extensions
- [ ] Delete `~/.vscode/extensions/krypton.sofas-extension*`
- [ ] Delete old `sofas-extension-1.0.0.vsix`
- [ ] Install fresh VSIX

### Phase 3: Verify New Code Runs
- [ ] Open VS Code
- [ ] View → Output → Select "SOFAS Extension Output"
- [ ] Should see: `╔════════════════════════════════════════════════════════════════╗`
- [ ] Should say: `SOFAS EXTENSION - FRESH START (NEW CODE)`
- [ ] Should NOT see old "SPLAT" or "SOFAS on Fail" channel

### Phase 4: Test Fail Sound
- [ ] In terminal: `npm run test:fail`
- [ ] Watch output logs
- [ ] Should see: `[isTestCommand] Detected: npm run test:fail`
- [ ] Should see: `[resolveSoundFile] Resolved fail sound to: C:\...\faah.mp3`
- [ ] Should see: `Sound file exists: true`
- [ ] Should see: `Playing sound on Windows`
- [ ] **SHOULD HEAR "FAAH" SOUND**

### Phase 5: Test Success Sound
- [ ] In terminal: `npm run test:success`
- [ ] Watch output logs
- [ ] Should see detection logs
- [ ] Should see success sound path resolution
- [ ] **SHOULD HEAR "I GOT THIS" SOUND**

### Phase 6: Test Commands
- [ ] Run: `code --execute-command sofasOnFail.testSound`
- [ ] **SHOULD HEAR SOUND**
- [ ] Run: `code --execute-command sofasOnFail.testSuccessSound`
- [ ] **SHOULD HEAR SOUND**

### Phase 7: Test UI
- [ ] Status bar shows "$(unmute) SOFAS"
- [ ] Click status bar → runs test sound
- [ ] Run command: `SOFAS: Test the Sound`
- [ ] Should play sound and show no errors

---

## Expected Outcomes

### Code Quality
✅ **Readable**: Clear sections, logical flow, easy to navigate  
✅ **Documented**: Every function explained, every decision logged  
✅ **Maintainable**: Future changes won't need 3-hour debugging  
✅ **Reliable**: Error handling prevents silent failures  

### Functionality
✅ **Audio Plays**: Sounds correctly play on test fail/success  
✅ **Command Detection**: `npm run test:*` works reliably  
✅ **Cross-Platform**: Windows PowerShell actually plays audio  
✅ **Settings Work**: Config values read correctly  

### Debugging
✅ **Observable**: Log messages show exactly what's happening  
✅ **Traceable**: Can follow code path from test execution to sound playback  
✅ **Distinct**: New code obviously different from old code  

### User Experience
✅ **No Silent Failures**: Problems are logged, not hidden  
✅ **Fast Diagnosis**: Logs tell you exactly what's wrong if something breaks  
✅ **Works Out of Box**: No manual configuration needed  

---

## Summary

This rewrite transforms SOFAS from a broken, hard-to-debug extension into a clean, reliable, and maintainable codebase. The key architectural improvements (using `context.extensionPath`, better command detection, comprehensive logging) solve the root causes of audio playback failure while making the code significantly easier to understand and modify.

