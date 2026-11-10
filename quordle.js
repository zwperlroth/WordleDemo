// Quordle for the web: solve four Wordle boards at once with one set of guesses.
// Same rules and scoring as quordle_tkinter.py.
// Loads words.txt from the same directory as this page.

"use strict";

// ------------------------------------------------------------------ engine

const WORD_LENGTH = 5;
const BOARDS = 4;
const MAX_GUESSES = 9;
const STRICT_WORDS = true; // Reject guesses that are not in WORDS

const GREEN = "G";
const YELLOW = "Y";
const GRAY = ".";

let WORDS = [];
let WORD_SET = new Set();

/** Return a 5-char string of G/Y/. for guess against target. */
function scoreGuess(guess, target) {
  const result = new Array(WORD_LENGTH).fill(GRAY);
  const remaining = target.split("");
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      result[i] = GREEN;
      remaining[i] = null;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === GREEN) continue;
    const j = remaining.indexOf(guess[i]);
    if (j !== -1) {
      result[i] = YELLOW;
      remaining[j] = null;
    }
  }
  return result.join("");
}

/** Pick n different random words. */
function pickTargets(n) {
  const picked = new Set();
  while (picked.size < n) {
    picked.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  return [...picked];
}

class QuordleGame {
  constructor(targets) {
    this.targets = targets || pickTargets(BOARDS);
    this.guesses = [];
    // Index of the guess that solved each board, or -1 if unsolved
    this.solvedAt = new Array(BOARDS).fill(-1);
  }

  solved(board) {
    return this.solvedAt[board] !== -1;
  }

  solvedCount() {
    return this.solvedAt.filter((i) => i !== -1).length;
  }

  won() {
    return this.solvedCount() === BOARDS;
  }

  over() {
    return this.won() || this.guesses.length >= MAX_GUESSES;
  }

  /** The [guess, score] rows shown on one board (it stops at its solving guess). */
  history(board) {
    const end = this.solved(board) ? this.solvedAt[board] + 1 : this.guesses.length;
    return this.guesses
      .slice(0, end)
      .map((g) => [g, scoreGuess(g, this.targets[board])]);
  }

  validate(guess) {
    if (this.over()) return "Game over";
    if (guess.length !== WORD_LENGTH || !/^[a-z]+$/.test(guess)) {
      return "Need " + WORD_LENGTH + " letters";
    }
    if (STRICT_WORDS && !WORD_SET.has(guess)) return "Not in word list";
    return null;
  }

  guess(guess) {
    const error = this.validate(guess);
    if (error) return error;
    this.guesses.push(guess);
    for (let b = 0; b < BOARDS; b++) {
      if (!this.solved(b) && guess === this.targets[b]) {
        this.solvedAt[b] = this.guesses.length - 1;
      }
    }
    return null;
  }
}

// ------------------------------------------------------------------ UI

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
];

// CSS class for each score letter ("." is not a valid class name)
const SCORE_CLASS = { [GREEN]: "G", [YELLOW]: "Y", [GRAY]: "gray" };

// Keyboard colors by rank (0 = not guessed yet on that board)
const RANK = { [GREEN]: 3, [YELLOW]: 2, [GRAY]: 1 };
const RANK_VAR = ["--key-unused", "--absent-key", "--yellow", "--green"];

class QuordleApp {
  constructor() {
    this.boardsEl = document.getElementById("boards");
    this.messageEl = document.getElementById("message");
    this.keyboardEl = document.getElementById("keyboard");

    this.boards = this.buildBoards();
    this.keys = this.buildKeyboard();

    document.getElementById("new-game").addEventListener("click", (e) => {
      e.currentTarget.blur(); // so Enter doesn't re-press the button
      this.newGame();
    });
    document.addEventListener("keydown", (e) => this.onKeydown(e));

    this.newGame();
  }

  buildBoards() {
    const boards = [];
    for (let b = 0; b < BOARDS; b++) {
      const boardEl = document.createElement("div");
      boardEl.className = "grid";
      boardEl.setAttribute("aria-label", "Board " + (b + 1));
      const tiles = [];
      for (let row = 0; row < MAX_GUESSES; row++) {
        const rowTiles = [];
        for (let col = 0; col < WORD_LENGTH; col++) {
          const tile = document.createElement("div");
          tile.className = "tile";
          boardEl.appendChild(tile);
          rowTiles.push(tile);
        }
        tiles.push(rowTiles);
      }
      this.boardsEl.appendChild(boardEl);
      boards.push({ el: boardEl, tiles });
    }
    return boards;
  }

  buildKeyboard() {
    const keys = {};
    for (const row of KEY_ROWS) {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      for (const label of row) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = label.length > 1 ? "key wide" : "key";
        key.textContent = label;
        key.addEventListener("click", (e) => {
          e.currentTarget.blur();
          this.press(label);
        });
        rowEl.appendChild(key);
        keys[label] = key;
      }
      this.keyboardEl.appendChild(rowEl);
    }
    return keys;
  }

  newGame() {
    this.game = new QuordleGame();
    this.current = "";
    this.message = "";
    this.draw();
  }

  /** Per board, the best rank seen for each letter. Solved boards count as blank. */
  letterStatus() {
    const status = [];
    for (let b = 0; b < BOARDS; b++) {
      const s = {};
      if (!this.game.solved(b)) {
        for (const [word, score] of this.game.history(b)) {
          for (let i = 0; i < WORD_LENGTH; i++) {
            s[word[i]] = Math.max(s[word[i]] || 0, RANK[score[i]]);
          }
        }
      }
      status.push(s);
    }
    return status;
  }

  press(label) {
    if (this.game.over()) return;
    if (label === "DEL") {
      this.current = this.current.slice(0, -1);
      this.message = "";
    } else if (label === "ENTER") {
      const error = this.game.guess(this.current);
      if (error) {
        this.message = error;
      } else {
        this.current = "";
        const g = this.game;
        if (g.won()) {
          this.message = "Solved all 4 in " + g.guesses.length + "!";
        } else if (g.over()) {
          const missed = g.targets.filter((_, b) => !g.solved(b));
          this.message = "Missed: " + missed.join(", ").toUpperCase();
        } else {
          this.message = g.solvedCount() + " of 4 solved";
        }
      }
    } else if (this.current.length < WORD_LENGTH) {
      this.current += label.toLowerCase();
      this.message = "";
    }
    this.draw();
  }

  onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      this.press("DEL");
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.press("ENTER");
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      this.press(e.key.toUpperCase());
    }
  }

  draw() {
    const game = this.game;
    const over = game.over();

    // Boards
    for (let b = 0; b < BOARDS; b++) {
      const { el, tiles } = this.boards[b];
      const history = game.history(b);
      const solved = game.solved(b);
      el.className = "grid" + (solved ? " solved" : over ? " missed" : "");
      for (let row = 0; row < MAX_GUESSES; row++) {
        for (let col = 0; col < WORD_LENGTH; col++) {
          const tile = tiles[row][col];
          if (row < history.length) {
            const [word, score] = history[row];
            tile.className = "tile " + SCORE_CLASS[score[col]];
            tile.textContent = word[col];
          } else if (!solved && !over && row === history.length && col < this.current.length) {
            tile.className = "tile typed";
            tile.textContent = this.current[col];
          } else {
            tile.className = "tile";
            tile.textContent = "";
          }
        }
      }
    }

    // Status message
    this.messageEl.textContent = this.message;

    // Keyboard: each key split into quarters, one per board
    // (top-left = board 1, top-right = 2, bottom-left = 3, bottom-right = 4)
    const status = this.letterStatus();
    for (const [label, key] of Object.entries(this.keys)) {
      if (label.length > 1) continue;
      const c = status.map((s) => "var(" + RANK_VAR[s[label.toLowerCase()] || 0] + ")");
      key.style.background =
        "conic-gradient(" +
        c[1] + " 0 25%, " + c[3] + " 0 50%, " +
        c[2] + " 0 75%, " + c[0] + " 0)";
    }
  }
}

// ------------------------------------------------------------------ music

const MUSIC_CLIPS = [
  "audio/claw-ingame-part1.mp3",
  "audio/claw-ingame-part2.mp3",
];

class Music {
  constructor(button) {
    const clip = MUSIC_CLIPS[Math.floor(Math.random() * MUSIC_CLIPS.length)];
    this.audio = new Audio(clip);
    this.audio.loop = true;
    this.button = button;
    this.started = false;

    // Try to play right away. Most browsers block sound until the player
    // clicks, taps or presses a key, so if that fails, start on the first
    // interaction instead.
    const start = () => {
      if (this.started) return;
      this.started = true;
      this.audio.play().catch(() => { this.started = false; });
    };
    start();
    for (const type of ["keydown", "pointerdown", "pointerup", "touchend", "click"]) {
      document.addEventListener(type, start);
    }

    button.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.audio.muted = !this.audio.muted;
      this.updateButton();
    });
    this.updateButton();
  }

  updateButton() {
    this.button.textContent = this.audio.muted ? "Music: off" : "Music: on";
    this.button.setAttribute("aria-pressed", String(!this.audio.muted));
  }
}

new Music(document.getElementById("music"));

// ------------------------------------------------------------------ startup

async function loadWords() {
  const response = await fetch("words.txt");
  if (!response.ok) throw new Error("HTTP " + response.status);
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
}

loadWords()
  .then((words) => {
    WORDS = words;
    WORD_SET = new Set(words);
    new QuordleApp();
  })
  .catch((err) => {
    document.getElementById("message").textContent =
      "Could not load words.txt (" + err.message + ")";
  });
