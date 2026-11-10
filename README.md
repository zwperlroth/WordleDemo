# WordleDemo — Quordle

Play it online: **https://zwperlroth.github.io/WordleDemo/**

A Quordle game: four Wordle puzzles at once. It comes in two versions that share
the same word list and rules:

- **Web**: `index.html`, `style.css` and `quordle.js`, with background music from `audio/`
- **Desktop**: `quordle_tkinter.py`, built with Python and tkinter (it also runs in Thonny)

## How to play

- There are 4 hidden 5-letter words, one per board. You have **9 guesses** to find all four.
- Each guess is entered on every board you haven't solved yet. Once a board is solved,
  it stops taking guesses and gets a green outline.
- On each board, a letter is colored green if it's in that word in the same spot,
  yellow if it's in the word but in a different spot, and gray if it isn't in the word.
- Each keyboard key is split into four quarters, one per board, laid out like the boards:
  top-left is board 1, top-right board 2, bottom-left board 3, bottom-right board 4.
- A guess has to be a real word from `words.txt`.
- If you run out of guesses, the boards you missed get a red outline and their words
  are shown below the boards.

## Running the web version

The page loads `words.txt` with `fetch`, so serve the folder over HTTP rather than
opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Type or click letters and press Enter to guess.
Use **New game** to restart and **Music** to toggle the soundtrack.

## Running the desktop version

```bash
python3 quordle_tkinter.py
```

You need Python 3 with tkinter (included with most Python installs). The script reads
`words.txt` from its own folder. The desktop version has no music.

## Files

| File | Purpose |
|---|---|
| `index.html` | Web page layout |
| `style.css` | Web styling |
| `quordle.js` | Web game logic and music |
| `quordle_tkinter.py` | Desktop game |
| `words.txt` | Word list (2,315 words) |
| `audio/` | Background music for the web version |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
