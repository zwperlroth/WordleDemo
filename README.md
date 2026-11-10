# WordleDemo: Quordle and Wordle Duel

Play it online:
- **Quordle:** https://zwperlroth.github.io/WordleDemo/
- **Wordle Duel (2 players):** https://zwperlroth.github.io/WordleDemo/duel.html

A Quordle game, four Wordle puzzles at once, plus a two-player Wordle Duel (see below).
Quordle comes in two versions that share the same word list and rules:

- **Web**: `index.html`, `quordle.js`, `common.js` and `style.css`, with background music from `audio/`
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

## Wordle Duel

Two or three players race to find the same word.

1. Each player opens https://zwperlroth.github.io/WordleDemo/duel.html on their own
   device or browser. The room holds up to 3 players.
2. Everyone presses **Ready**. The round starts once everyone in the room is ready,
   so you can play with 2 or 3.
3. Each player has 6 guesses. Your board is the big one. The small boards next to it
   show each opponent's colors as they guess, but not their letters.
4. The first player to find the word wins the round, and their board gets a green
   outline. If nobody finds it, it's a draw. Press **Ready** again for the next round.
   The score badges count wins.

If a player leaves mid-round, the others keep playing (the round ends if only one is
left). Someone who arrives mid-round joins at the next round.

Everyone who opens `duel.html` shares one room. To play without strangers getting
in, press **New private room** and send the new link (it ends in `#` plus a code)
to the other players.

How it works: the two browsers connect directly over WebRTC using
[PeerJS](https://peerjs.com/). The free public PeerJS server only introduces them,
so there's no server to run. The first player in a room becomes the host (Player 1),
and the others connect to the host's browser. The host picks the word, decides who
won and passes every update along to the others. If the host leaves, the remaining
players form a new room automatically; the round count and scores start over.

Limitations:
- It needs the PeerJS server and unpkg.com (where the PeerJS library loads from) to be
  reachable. Some strict school or office networks block the direct connection.
- The word is sent to both browsers, so a player who opens the browser's developer
  tools could find it. It's a game between friends, not a secure contest.

## Running the web version

The page loads `words.txt` with `fetch`, so serve the folder over HTTP rather than
opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 for Quordle, or http://localhost:8000/duel.html for the
duel. Type or click letters and press Enter to guess. **Music** toggles the
soundtrack on both pages.

## Running the desktop version

```bash
python3 quordle_tkinter.py
```

You need Python 3 with tkinter (included with most Python installs). The script reads
`words.txt` from its own folder. The desktop version has no music.

## Files

| File | Purpose |
|---|---|
| `index.html` | Quordle page |
| `quordle.js` | Quordle game logic |
| `duel.html` | Wordle Duel page |
| `duel.js` | Duel game logic and the connection between players |
| `common.js` | Shared by both pages: scoring, word list loading, keyboard, music |
| `style.css` | Styling for both pages |
| `quordle_tkinter.py` | Desktop game |
| `words.txt` | Word list (2,315 words) |
| `audio/` | Background music for the web version |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
