# WordleDemo

A Wordle clone in two versions that share the same word list and rules:

- **Web**: `index.html`, `style.css` and `wordle.js`, with background music from `audio/`
- **Desktop**: `wordle_tkinter.py`, built with Python and tkinter (it also runs in Thonny)

You have 6 tries to guess a 5-letter word. After each guess, every letter is colored:
green means the right letter in the right spot, yellow means the letter is in the word
but in a different spot, and gray means it isn't in the word. A guess has to be a real
word from `words.txt`.

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
python3 wordle_tkinter.py
```

You need Python 3 with tkinter (included with most Python installs). The script reads
`words.txt` from its own folder.

## Files

| File | Purpose |
|---|---|
| `index.html` | Web page layout |
| `style.css` | Web styling |
| `wordle.js` | Web game logic |
| `wordle_tkinter.py` | Desktop game |
| `words.txt` | Word list (2,315 words) |
| `audio/` | Background music for the web version |
