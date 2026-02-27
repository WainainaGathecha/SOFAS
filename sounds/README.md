# Sounds Directory

Place your audio files here. The extension expects the following filenames:

## Failure Sounds
- `splat.mp3`       — Classic splat/impact sound
- `bruh.mp3`        — The "bruh" sound effect
- `sad_trombone.mp3`— Wah wah wahhhh
- `error.mp3`       — Digital error beep

## Success Sounds
- `tada.mp3`        — Fanfare / ta-da
- `chime.mp3`       — Soft success chime

## Where to Get Free Sound Effects

1. **Freesound.org** (https://freesound.org) — large library, requires free account
2. **Pixabay Sounds** (https://pixabay.com/sound-effects/) — no account needed
3. **Mixkit** (https://mixkit.co/free-sound-effects/) — free with attribution
4. **YouTube Audio Library** — free sounds from Google

## Custom Sounds

You can point the extension at any `.mp3` or `.wav` file on your computer
using the settings:

```json
{
  "splatOnFail.customFailSoundPath": "/Users/you/sounds/my-fail.mp3",
  "splatOnFail.customSuccessSoundPath": "/Users/you/sounds/my-pass.mp3"
}
```

The extension bundles placeholder files. Replace them with real audio files
before packaging or publishing the extension.
