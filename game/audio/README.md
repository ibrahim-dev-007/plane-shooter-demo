# Audio sources

The game plays the MP3s in `game/` (`music-*.mp3`, `jingle-*.mp3`, `sfx-*.mp3`). This folder holds
the WAV originals they are made from; nothing in here is served.

- `music/` – three loops (menu, gameplay, boss) and three jingles (level start, victory, game over).
- `sfx/` – every effect the game uses. See the `SFX` table in `index.html` for which event plays which.
- `trash/` – files the game does not use: the engine loops, the OGG copies of the music, and the
  sounds the game shipped with before this pack.

To rebuild an MP3 after editing a WAV (music keeps stereo, effects are mono):

```
ffmpeg -i audio/music/music_boss_loop.wav -codec:a libmp3lame -b:a 128k music-boss.mp3
ffmpeg -i audio/sfx/explosion_small.wav -codec:a libmp3lame -b:a 96k -ac 1 sfx-boom-s.mp3
```

Any new served file must also be added to `GAME_FILES` in `lib/game-gate.ts`, or production refuses it.
