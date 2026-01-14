# Kanji Meaning Trainer (PWA)

A GitHub Pages friendly PWA for learning **kanji meanings only** (no readings).

## Features
- Pick a JLPT level and lesson: N5 / N4 / N3 / N2 / N1
- **Combination kanji** (compounds like 学生) toggle: On/Off
- Direction: Kanji → English, English → Kanji, or Mixed
- Answer type: Multiple choice, Written, or Mixed
- **Never auto-advances** — you must press **Next**
- Offline support (service worker)

## Deploy on GitHub Pages
1. Create a repo (example: `kanji-meaning-trainer`)
2. Upload all files from this folder to the repo root
3. Repo → Settings → Pages → Deploy from branch → `main` → `/ (root)`
4. Open your GitHub Pages URL

## Add more kanji
Edit `data/kanji.json`.

Each item:
```json
{
  "id": 999,
  "level": "N3",
  "kanji": "説明",
  "meaning": "explanation",
  "alts": ["describe"],
  "compound": true
}
```

Notes:
- Written answers accept:
  - For Kanji→English: your answer is matched against `meaning` + `alts` (punctuation ignored, case-insensitive, drops leading a/an/the).
  - For English→Kanji: must match the kanji exactly (spaces ignored).
- Lessons are groups of 10 kanji in the JSON order per level.
