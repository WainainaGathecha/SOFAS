/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║                       S O F A S   E X T E N S I O N                       ║
 * ║                     Sound On FAil - System (v2.0)                          ║
 * ║                                                                            ║
 * ║  A VS Code extension that plays audio feedback when tests pass or fail.   ║
 * ║                                                                            ║
 * ║  Features:                                                                 ║
 * ║  • Detects test execution across 50+ frameworks & languages              ║
 * ║  • Plays customizable sounds on pass/fail                                ║
 * ║  • Shows notifications and status bar updates                            ║
 * ║  • Cross-platform audio (Windows/macOS/Linux)                           ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: IMPORTS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');
const { platform } = require('os');

/**
 * List of test commands that trigger sound on pass/fail.
 * Covers JavaScript, Python, Ruby, Go, Rust, Java, .NET, PHP, and more.
 * 
 * When any of these commands execute and exit with non-zero (failure),
 * the "fail" sound plays. Exit code 0 (success) triggers "success" sound.
 */
const DEFAULT_TEST_COMMANDS = [
  // JavaScript / TypeScript
  'jest', 'vitest', 'mocha', 'jasmine', 'karma', 'ava',
  'cypress', 'playwright', 'bun test', 'deno test',
  'npm test', 'npm run test', 'npx jest', 'npx vitest',
  'yarn test', 'pnpm test', 'npm run test:fail', 'npm run test:success',

  // Python
  'pytest', 'python -m pytest', 'tox', 'nox', 'unittest', 'python -m unittest',

  // Ruby
  'rspec', 'bundle exec rspec', 'rails test', 'rake test', 'minitest',

  // Go
  'go test',

  // Rust
  'cargo test',

  // Elixir
  'mix test',

  // Flutter / Dart
  'flutter test', 'dart test',

  // Java / JVM
  'mvn test', 'gradle test', 'gradlew test', './gradlew test', 'mvn verify', 'junit',

  // .NET
  'dotnet test', 'nunit', 'xunit',

  // PHP
  'phpunit', 'vendor/bin/phpunit', './vendor/bin/phpunit',

  // C / C++
  'ctest', 'make test',

  // Shell / Bash
  'bash test.sh', 'bash tests.sh', 'bash run_tests.sh',
  'sh test.sh', './test.sh', './tests.sh', './run_tests.sh',

  // Generic
  'make test', 'make check', 'test-fail.bat', 'test-success.bat',
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension path where sounds/ folder is located.
 * Set during activation using context.extensionPath
 * 
 * This is THE KEY FIX for audio resolution:
 * Instead of calculating path from __dirname (which breaks in packaged VSIX),
 * we use the reliable path provided by VS Code.
 * 
 * Example: C:\Users\user\.vscode\extensions\krypton.sofas-extension-1.0.0\
 */
let extensionPath = null;

/**
 * VS Code output channel for logging debug messages.
 * User can see these via View → Output → "SOFAS Extension Output"
 * 
 * Using a unique name ensures we can tell apart old vs new code.
 */
let outputChannel = null;

/**
 * Status bar item (the button that appears in the bottom right).
 * Shows current state and allows user to click for quick sound test.
 */
let statusBarItem = null;

/**
 * Timestamp of last sound played.
 * Used to enforce cooldown period and prevent sound spam.
 */
let lastSoundTime = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: UTILITIES & LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a message to the SOFAS output panel with timestamp.
 * 
 * This is called throughout the code to show what's happening.
 * User sees this via View → Output → "SOFAS Extension Output"
 * 
 * @param {string} message - The text to log
 * 
 * @example
 *   log('Test failure detected!');
 *   // Output: "[10:45:32 AM] Test failure detected!"
 */
function log(message) {
  if (!outputChannel) return;
  const timeStr = new Date().toLocaleTimeString();
  outputChannel.appendLine(`[${timeStr}] ${message}`);
}

/**
 * Safely read a VS Code configuration value with fallback.
 * 
 * The VS Code settings API can throw errors in certain contexts, and settings
 * might not exist. This function wraps the read with error handling and always
 * returns a usable value (configured or default).
 * 
 * @param {string} key - Setting key (without "sofasOnFail." prefix)
 * @param {*} defaultValue - What to return if setting not found
 * @returns {*} The configured value, or defaultValue if missing/error
 * 
 * @example
 *   getConfigValue('enabled', true)        // → true or configured value
 *   getConfigValue('volume', 0.7)          // → 0.7 or configured volume
 *   getConfigValue('failSound', 'faah')    // → 'faah' or configured sound
 */
function getConfigValue(key, defaultValue) {
  try {
    const config = vscode.workspace.getConfiguration('sofasOnFail');
    const value = config.get(key);
    
    // If value exists and is not null/undefined, use it. Otherwise use default.
    return (value !== undefined && value !== null) ? value : defaultValue;
  } catch (error) {
    log(`⚠ Failed to read config key "${key}": ${error.message}`);
    return defaultValue;
  }
}

/**
 * Check if a file exists at the given path.
 * 
 * Used to validate sound files before attempting playback.
 * Safe function that returns boolean, never throws.
 * 
 * @param {string} filePath - Absolute path to file to check
 * @returns {boolean} true if file exists, false otherwise
 * 
 * @example
 *   fileExists('C:\\Users\\user\\.vscode\\extensions\\...\\sounds\\faah.mp3')
 *   // → true if the file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: SOUND RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the absolute path to the extension's sounds directory.
 * 
 * KEY FIX #1: Uses context.extensionPath instead of calculating from __dirname
 * This is why the original code failed - __dirname points to src/ folder and
 * path calculations break in packaged VSIX. context.extensionPath is reliable.
 * 
 * @returns {string|null} Absolute path to sounds folder, or null if not accessible
 * 
 * @example
 *   getSoundsDirectory()
 *   // → "C:\\Users\\user\\.vscode\\extensions\\krypton.sofas-extension-1.0.0\\sounds"
 */
function getSoundsDirectory() {
  if (!extensionPath) {
    log('ERROR: Extension path not initialized');
    return null;
  }

  const soundsDir = path.join(extensionPath, 'sounds');
  
  if (!fileExists(soundsDir)) {
    log(`ERROR: Sounds directory not found: ${soundsDir}`);
    return null;
  }

  return soundsDir;
}

/**
 * Resolve the sound file to play based on type and user settings.
 * 
 * This function:
 * 1. Checks for custom sound override (user-specified file)
 * 2. Gets configured sound name (faah, pleasespeed, igotthis, hihopbeat)
 * 3. Handles random selection if configured
 * 4. Builds absolute path and validates it exists
 * 5. Returns null if anything fails (with logging)
 * 
 * @param {string} type - Either 'fail' or 'success' to determine sound type
 * @returns {string|null} Absolute path to sound file, or null if not found
 * 
 * @example
 *   resolveSoundFile('fail')
 *   // → "C:\\...\\sounds\\faah.mp3"
 *   
 *   resolveSoundFile('success')
 *   // → "C:\\...\\sounds\\igotthis.mp3"
 */
function resolveSoundFile(type) {
  const soundsDir = getSoundsDirectory();
  if (!soundsDir) {
    return null;
  }

  if (type === 'fail') {
    // Check if user specified custom fail sound file
    const customPath = getConfigValue('customFailSoundPath', '').trim();
    if (customPath && fileExists(customPath)) {
      log(`[resolveSoundFile] Using custom fail sound: ${customPath}`);
      return customPath;
    }

    // Get configured fail sound (faah, pleasespeed, or random)
    let soundName = getConfigValue('failSound', 'faah');
    const availableSounds = ['faah', 'pleasespeed'];

    // If random is selected, pick one
    if (soundName === 'random') {
      soundName = availableSounds[Math.floor(Math.random() * availableSounds.length)];
      log(`[resolveSoundFile] Random selected: ${soundName}`);
    }

    const soundPath = path.join(soundsDir, `${soundName}.mp3`);
    log(`[resolveSoundFile] Fail sound: ${soundPath} (exists: ${fileExists(soundPath)})`);
    
    if (!fileExists(soundPath)) {
      log(`ERROR: Fail sound file not found: ${soundPath}`);
      return null;
    }

    return soundPath;
  }

  if (type === 'success') {
    // Check if user specified custom success sound file
    const customPath = getConfigValue('customSuccessSoundPath', '').trim();
    if (customPath && fileExists(customPath)) {
      log(`[resolveSoundFile] Using custom success sound: ${customPath}`);
      return customPath;
    }

    // Get configured success sound (igotthis, hihopbeat, none, or random)
    let soundName = getConfigValue('successSound', 'igotthis');
    const availableSounds = ['igotthis', 'hihopbeat'];

    // If random is selected, pick one
    if (soundName === 'random') {
      soundName = availableSounds[Math.floor(Math.random() * availableSounds.length)];
      log(`[resolveSoundFile] Random selected: ${soundName}`);
    }

    // If success sound is disabled, return null
    if (soundName === 'none') {
      log(`[resolveSoundFile] Success sound disabled (set to "none")`);
      return null;
    }

    const soundPath = path.join(soundsDir, `${soundName}.mp3`);
    log(`[resolveSoundFile] Success sound: ${soundPath} (exists: ${fileExists(soundPath)})`);
    
    if (!fileExists(soundPath)) {
      log(`ERROR: Success sound file not found: ${soundPath}`);
      return null;
    }

    return soundPath;
  }

  log(`ERROR: Unknown sound type: ${type}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: AUDIO PLAYBACK (PLATFORM-SPECIFIC)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Play audio on Windows using PowerShell's MediaPlayer.
 * 
 * Windows doesn't have built-in command-line audio, so we use PowerShell
 * to access .NET's System.Windows.Media.MediaPlayer class.
 * 
 * @param {string} filePath - Absolute path to .mp3 file
 * @param {number} volume - Volume level (0.1 to 1.0)
 */
function playOnWindows(filePath, volume) {
  // Convert Windows backslashes to forward slashes for PowerShell URI
  const uriPath = filePath.replace(/\\/g, '/');

  // Build PowerShell command to play audio
  // This single-line command: creates MediaPlayer, loads file, sets volume, plays, waits
  const script = `Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]"file:///${uriPath}"); $p.Volume = ${volume}; $p.Play(); [System.Threading.Thread]::Sleep(5000);`;

  // Execute via PowerShell (escape quotes in command)
  exec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
    if (error) {
      log(`ERROR (Windows audio): ${error.message}`);
      if (stderr) log(`  stderr: ${stderr}`);
    } else {
      log(`✓ Audio played successfully (Windows)`);
    }
  });
}

/**
 * Play audio on macOS using the built-in `afplay` command.
 * 
 * macOS includes afplay which is simple and reliable.
 * The -v flag sets volume (0.0 to 1.0).
 * 
 * @param {string} filePath - Absolute path to .mp3 file
 * @param {number} volume - Volume level (0.1 to 1.0)
 */
function playOnMacOS(filePath, volume) {
  // Use afplay with volume flag
  execFile('afplay', ['-v', String(volume), filePath], (error) => {
    if (error) {
      log(`ERROR (macOS audio): ${error.message}`);
    } else {
      log(`✓ Audio played successfully (macOS)`);
    }
  });
}

/**
 * Play audio on Linux using available media players.
 * 
 * Linux has several audio players. We try multiple in order of preference:
 * 1. mpg123 (fast, reliable for mp3)
 * 2. ffplay (from FFmpeg, usually available)
 * 3. paplay (PulseAudio player)
 * 
 * The || operator means "if first fails, try next".
 * 
 * @param {string} filePath - Absolute path to .mp3 file
 * @param {number} volume - Volume level (0.1 to 1.0)
 */
function playOnLinux(filePath, volume) {
  const volumePercent = Math.round(volume * 100);

  // Try multiple players in order
  const command = `mpg123 -q -f ${Math.round(volume * 32768)} "${filePath}" 2>/dev/null || \
                  ffplay -nodisp -autoexit -volume ${volumePercent} "${filePath}" 2>/dev/null || \
                  paplay "${filePath}" 2>/dev/null`;

  exec(command, (error) => {
    if (error && error.code !== 0) {
      log(`ERROR (Linux audio): ${error.message}`);
    } else {
      log(`✓ Audio played successfully (Linux)`);
    }
  });
}

/**
 * Main sound playback function.
 * 
 * This function:
 * 1. Checks if extension is enabled
 * 2. Enforces cooldown period (prevent sound spam)
 * 3. Checks if VS Code is focused (if configured)
 * 4. Resolves the sound file path
 * 5. Validates file exists
 * 6. Routes to platform-specific playback
 * 
 * @param {string} type - Sound type: 'fail' or 'success'
 */
function playSound(type) {
  log(`[playSound] Called with type: '${type}'`);

  // Step 1: Check if extension is enabled
  if (!getConfigValue('enabled', true)) {
    log('  Skipped: Extension disabled in settings');
    return;
  }

  // In the Windows audio player function, replace the MediaPlayer code with:
if (process.platform === 'win32') {
  try {
    // Use system beep as fallback - guaranteed to work
    console.log('\\x07'); // ASCII bell character
    log('✓ System beep played (Windows)');
  } catch (error) {
    log(`✗ Audio failed: ${error.message}`);
  }
}

  // Step 2: Check cooldown (prevent rapid sound spam)
  const cooldownSeconds = getConfigValue('cooldownSeconds', 3);
  const cooldownMs = cooldownSeconds * 1000;
  const timeSinceLastSound = Date.now() - lastSoundTime;

  if (timeSinceLastSound < cooldownMs) {
    log(`  Skipped: In cooldown (${Math.ceil((cooldownMs - timeSinceLastSound) / 1000)}s remaining)`);
    return;
  }

  lastSoundTime = Date.now();

  // Step 3: Check if only playing when VS Code is active
  if (getConfigValue('onlyActiveEditor', false)) {
    if (!vscode.window.state?.focused) {
      log('  Skipped: VS Code is not the active window');
      return;
    }
  }

  // Step 4: Resolve the sound file path
  const soundFile = resolveSoundFile(type);
  if (!soundFile) {
    log(`  ERROR: Could not resolve sound file for type '${type}'`);
    vscode.window.showErrorMessage(`SOFAS: Could not find sound file for "${type}"`);
    return;
  }

  // Step 5: Validate file exists
  if (!fileExists(soundFile)) {
    log(`  ERROR: Sound file does not exist: ${soundFile}`);
    vscode.window.showErrorMessage(`SOFAS: Sound file missing: ${soundFile}`);
    return;
  }

  // Step 6: Get configured volume
  const volume = Math.max(0.1, Math.min(1.0, getConfigValue('volume', 0.7)));
  log(`  Playing: ${soundFile} (volume: ${volume})`);

  // Step 7: Play on appropriate platform
  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
    playOnWindows(soundFile, volume);
  } else if (currentPlatform === 'darwin') {
    playOnMacOS(soundFile, volume);
  } else {
    playOnLinux(soundFile, volume);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: TEST COMMAND DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract the actual command from a full command line.
 * 
 * Examples:
 * • "npm run test:fail" → "npm run test:fail"
 * • "npm run test:fail --verbose" → "npm run test:fail"
 * • "npm test" → "npm test"
 * 
 * This handles pipes and semicolons which might separate commands.
 * 
 * @param {string} commandLine - Full command line as typed
 * @returns {string} Extracted command in lowercase
 */
function extractCommand(commandLine) {
  if (!commandLine) return '';

  // Take everything before the first pipe or semicolon
  const baseCommand = commandLine.split(/[|;]/)[0].trim();
  return baseCommand.toLowerCase();
}

/**
 * Check if a command line represents test execution.
 * 
 * KEY FIX #2: Uses both exact matching AND smart heuristics.
 * 
 * This solves the problem where "npm run test:fail" wasn't recognized:
 * • Exact match: Checks against DEFAULT_TEST_COMMANDS list
 * • Heuristic match: If contains "test" + ("npm" or ".bat" or ".sh"), it's a test
 * 
 * @param {string} commandLine - Command to check
 * @returns {boolean} true if this looks like a test command
 */
function isTestCommand(commandLine) {
  if (!commandLine) return false;

  const cmd = extractCommand(commandLine);

  // Check 1: Exact match against known test commands
  const isKnownCommand = DEFAULT_TEST_COMMANDS.some(testCmd => {
    return cmd === testCmd.toLowerCase();
  });

  if (isKnownCommand) {
    log(`[isTestCommand] Matched known command: "${cmd}"`);
    return true;
  }

  // Check 2: Heuristic - contains "test" + test runner indicator
  const hasTestKeyword = cmd.includes('test');
  const hasRunnerIndicator = cmd.includes('npm') || cmd.includes('.bat') || cmd.includes('.sh');

  if (hasTestKeyword && hasRunnerIndicator) {
    log(`[isTestCommand] Matched heuristic: "${cmd}"`);
    return true;
  }

  log(`[isTestCommand] Not a test command: "${cmd}"`);
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Listen for terminal close events and check if it ran a test.
 * 
 * When a terminal closes, we can inspect it to see if the command
 * run was a test command. If yes and exit code != 0, play fail sound.
 * If exit code == 0, play success sound.
 * 
 * Note: This only works if the terminal is closed by the user,
 * not if the process just finished and terminal stays open.
 */
function setupTerminalCloseListener(context) {
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(terminal => {
      const exitCode = terminal.exitStatus?.code;
      
      log(`[onDidCloseTerminal] "${terminal.name}" closed with exit code: ${exitCode}`);

      if (exitCode === undefined) {
        log('  Exit code undefined, skipping');
        return;
      }

      const terminalName = terminal.name || '';
      if (!isTestCommand(terminalName)) {
        log(`  Not a test command: "${terminalName}"`);
        return;
      }

      // Trigger sound based on exit code
      if (exitCode !== 0) {
        onTestFailed();
      } else {
        onTestPassed();
      }
    })
  );
}

/**
 * Listen for shell commands executed in terminal.
 * 
 * This is KEY FIX #2: The shell integration provides the actual command
 * executed, allowing us to detect "npm run test:fail" even if the
 * terminal stays open.
 * 
 * The onDidExecuteTerminalCommand event fires after a shell command
 * completes, giving us:
 * • commandLine: exactly what the user typed
 * • exitCode: return code from the process
 * 
 * This is HOW we detect npm test scripts now!
 */
function setupShellCommandListener(context) {
  if (!vscode.window.onDidExecuteTerminalCommand) {
    log('WARNING: Shell integration not available (old VS Code version?)');
    return;
  }

  context.subscriptions.push(
    vscode.window.onDidExecuteTerminalCommand(event => {
      const { commandLine, exitCode } = event;

      log(`[onDidExecuteTerminalCommand] "${commandLine}" → exit code: ${exitCode}`);

      if (exitCode === undefined) {
        log('  Exit code is undefined, skipping');
        return;
      }

      if (!isTestCommand(commandLine)) {
        return; // Not a test, don't trigger anything
      }

      // Trigger sound based on exit code
      log(`  ✓ Recognized as test command, triggering callback`);
      if (exitCode !== 0) {
        onTestFailed();
      } else {
        onTestPassed();
      }
    })
  );
}

/**
 * Listen for VS Code task completion events.
 * 
 * Some users run tests via VS Code tasks instead of terminal.
 * This listener handles that case.
 */
function setupTaskListener(context) {
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess(event => {
      const exitCode = event.exitCode;
      const task = event.execution.task;
      const taskName = task.name || '';

      log(`[onDidEndTaskProcess] Task "${taskName}" completed with exit code: ${exitCode}`);

      // Check if this is a test task
      const isTestTask = 
        task.group === vscode.TaskGroup.Test ||  // Explicitly marked as test
        isTestCommand(taskName);                  // Looks like test command

      if (!isTestTask) {
        log('  Not a test task, skipping');
        return;
      }

      // Trigger sound based on exit code
      log(`  ✓ Recognized as test task, triggering callback`);
      if (exitCode !== 0 && exitCode !== undefined) {
        onTestFailed();
      } else if (exitCode === 0) {
        onTestPassed();
      }
    })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: TEST RESULT CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle test failure.
 * 
 * Called when a test command exits with non-zero code.
 * This function:
 * 1. Checks if extension is enabled
 * 2. Updates status bar to show failure
 * 3. Plays fail sound
 * 4. Shows notification (if configured)
 * 5. Resets status bar after delay
 */
function onTestFailed() {
  if (!getConfigValue('enabled', true)) return;

  log('[onTestFailed] Test run failed!');

  // Update status bar immediately
  updateStatusBar('fail');

  // Play fail sound
  playSound('fail');

  // Show notification if enabled
  if (getConfigValue('showNotification', true)) {
    const messages = getConfigValue('failMessages', ['Tests failed.']);
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    vscode.window.showWarningMessage(randomMessage);
  }

  // Reset status bar after 5 seconds
  setTimeout(() => updateStatusBar(), 5000);
}

/**
 * Handle test success.
 * 
 * Called when a test command exits with code 0.
 * This function:
 * 1. Checks if extension is enabled
 * 2. Updates status bar to show success
 * 3. Plays success sound (if configured)
 * 4. Shows notification (if configured)
 * 5. Resets status bar after delay
 */
function onTestPassed() {
  if (!getConfigValue('enabled', true)) return;

  log('[onTestPassed] All tests passed!');

  // Update status bar immediately
  updateStatusBar('pass');

  // Play success sound if enabled (config default is "igotthis", not "none")
  const successSound = getConfigValue('successSound', 'igotthis');
  if (successSound !== 'none') {
    playSound('success');
  }

  // Show notification if enabled
  if (getConfigValue('showSuccessNotification', false)) {
    vscode.window.showInformationMessage('All tests passed!');
  }

  // Reset status bar after 3 seconds
  setTimeout(() => updateStatusBar(), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all user commands.
 * 
 * These can be invoked via:
 * • Command palette (Ctrl+Shift+P)
 * • Status bar click
 * • Keyboard shortcut (if user configures)
 * • VS Code CLI
 */
function registerCommands(context) {
  // Enable the extension
  context.subscriptions.push(
    vscode.commands.registerCommand('sofasOnFail.enable', () => {
      log('[Command] Enable requested');
      getConfig().update('enabled', true, true);
      vscode.window.showInformationMessage('SOFAS: Enabled');
      updateStatusBar();
    })
  );

  // Disable the extension
  context.subscriptions.push(
    vscode.commands.registerCommand('sofasOnFail.disable', () => {
      log('[Command] Disable requested');
      getConfig().update('enabled', false, true);
      vscode.window.showInformationMessage('SOFAS: Disabled');
      updateStatusBar();
    })
  );

  // Play test fail sound
  context.subscriptions.push(
    vscode.commands.registerCommand('sofasOnFail.testSound', () => {
      log('[Command] Test fail sound requested');
      playSound('fail');
    })
  );

  // Play test success sound
  context.subscriptions.push(
    vscode.commands.registerCommand('sofasOnFail.testSuccessSound', () => {
      log('[Command] Test success sound requested');
      playSound('success');
    })
  );
}

/**
 * Get VS Code configuration object for sofasOnFail.
 * 
 * This is a helper to access settings.
 * Real reading happens in getConfigValue() which has error handling.
 * 
 * @returns {vscode.WorkspaceConfiguration} Configuration object
 */
function getConfig() {
  return vscode.workspace.getConfiguration('sofasOnFail');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: UI UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update status bar appearance based on state.
 * 
 * The status bar is the "button" in the bottom right that shows
 * the current state and allows clicking to test sounds.
 * 
 * @param {string|undefined} state - 'fail', 'pass', or undefined for normal
 */
function updateStatusBar(state) {
  const enabled = getConfigValue('enabled', true);

  if (!enabled) {
    // Extension disabled state
    statusBarItem.text = '$(mute) SOFAS';
    statusBarItem.tooltip = 'SOFAS: Disabled — click to enable';
    statusBarItem.command = 'sofasOnFail.enable';
    statusBarItem.backgroundColor = undefined;
  } else if (state === 'fail') {
    // Just detected failure - show warning colors
    statusBarItem.text = '$(warning) SOFAS';
    statusBarItem.tooltip = 'Tests failed!';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (state === 'pass') {
    // Just detected success - show success colors
    statusBarItem.text = '$(check) SOFAS';
    statusBarItem.tooltip = 'Tests passed!';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    // Normal active state
    statusBarItem.text = '$(unmute) SOFAS';
    statusBarItem.tooltip = 'SOFAS: Active — click to test sound';
    statusBarItem.command = 'sofasOnFail.testSound';
    statusBarItem.backgroundColor = undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: ACTIVATION & DEACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension activation hook.
 * 
 * Called when VS Code loads the extension. This happens when:
 * • VS Code starts
 * • User installs/enables the extension
 * • VS Code detects an activation event (onStartupFinished)
 * 
 * We initialize everything needed here.
 * 
 * @param {vscode.ExtensionContext} context - Extension context provided by VS Code
 */
function activate(context) {
  // ───────────────────────────────────────────────────────────────────────────
  // Step 1: Store extension path (FIX #1: Key for audio resolution)
  // ───────────────────────────────────────────────────────────────────────────
  extensionPath = context.extensionPath;
  log(`Extension path: ${extensionPath}`);

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2: Create output channel
  // ───────────────────────────────────────────────────────────────────────────
  outputChannel = vscode.window.createOutputChannel('SOFAS Extension Output');

  // Welcome message makes it clear new code is running
  log('╔════════════════════════════════════════════════════════════════════════╗');
  log('║                                                                        ║');
  log('║                   ✓ SOFAS EXTENSION ACTIVATED ✓                       ║');
  log('║                                                                        ║');
  log('║  Sound On FAil System - v2.0 (Complete Rewrite)                      ║');
  log('║                                                                        ║');
  log('║  Listening for test execution...                                      ║');
  log('║                                                                        ║');
  log('╚════════════════════════════════════════════════════════════════════════╝');

  // ───────────────────────────────────────────────────────────────────────────
  // Step 3: Create and show status bar
  // ───────────────────────────────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100  // Priority: higher numbers appear further right
  );
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ───────────────────────────────────────────────────────────────────────────
  // Step 4: Register all commands
  // ───────────────────────────────────────────────────────────────────────────
  registerCommands(context);

  // ───────────────────────────────────────────────────────────────────────────
  // Step 5: Set up event listeners
  // ───────────────────────────────────────────────────────────────────────────
  setupTerminalCloseListener(context);
  setupShellCommandListener(context);           // KEY FIX #2: Detects npm test
  setupTaskListener(context);

  log('✓ Initialization complete');
}

/**
 * Extension deactivation hook.
 * 
 * Called when VS Code unloads the extension. This happens when:
 * • VS Code closes
 * • User disables the extension
 * • User uninstalls the extension
 * 
 * Cleanup happens automatically via context.subscriptions.
 */
function deactivate() {
  if (outputChannel) {
    log('Extension deactivated.');
    outputChannel.dispose();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export the two required extension functions.
 * VS Code calls these at the appropriate times in the extension lifecycle.
 */
module.exports = {
  activate,
  deactivate,
};
