# Changelog

## [1.0.0] — Initial Release

### Added
- Shell integration via `onDidExecuteTerminalCommand` — reads actual command lines
- Terminal close event fallback for broader compatibility
- VS Code task monitoring for `Test` group tasks
- 4 built-in fail sounds: `splat`, `bruh`, `sad_trombone`, `error`
- 2 built-in success sounds: `tada`, `chime`
- Random sound mode
- Custom sound path support (`.mp3` and `.wav`)
- Volume control (0.1 – 1.0)
- Configurable failure message pool
- `extraTestCommands` setting for custom commands (bash, git, etc.)
- Cooldown system to prevent sound spamming
- `onlyActiveEditor` option to suppress sounds when VS Code is unfocused
- Status bar item with visual fail/pass feedback
- Output channel logging (`View → Output → SPLAT on Fail`)
- Cross-platform audio: macOS (`afplay`), Windows (PowerShell), Linux (`aplay/paplay/ffplay`)
- Optional success sound and notification
