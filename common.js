// Code shared by the Quordle page (quordle.js) and the Duel page (duel.js):
// scoring, the word list, the keyboard layout and the background music.

"use strict";

const WORD_LENGTH = 5;
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

/** Return an error message if guess isn't a playable word, else null. */
function checkWord(guess) {
  if (guess.length !== WORD_LENGTH || !/^[a-z]+$/.test(guess)) {
    return "Need " + WORD_LENGTH + " letters";
  }
  if (STRICT_WORDS && !WORD_SET.has(guess)) return "Not in word list";
  return null;
}

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

// ------------------------------------------------------------------ keyboard

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
];

// CSS class for each score letter ("." is not a valid class name)
const SCORE_CLASS = { [GREEN]: "G", [YELLOW]: "Y", [GRAY]: "gray" };

/** Build the on-screen keyboard in container; returns {label: button}. */
function buildKeyboard(container, onPress) {
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
        e.currentTarget.blur(); // so Enter doesn't re-press the button
        onPress(label);
      });
      rowEl.appendChild(key);
      keys[label] = key;
    }
    container.appendChild(rowEl);
  }
  return keys;
}

/** Route physical key presses to onPress as "A".."Z", "ENTER" or "DEL". */
function listenForKeys(onPress) {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onPress("DEL");
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPress("ENTER");
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      onPress(e.key.toUpperCase());
    }
  });
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

// ------------------------------------------------------------------ startup

/** Load words.txt, then call start(); show an error in #message on failure. */
function loadWordsThen(start) {
  fetch("words.txt")
    .then((response) => {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    })
    .then((text) => {
      WORDS = text
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0);
      WORD_SET = new Set(WORDS);
      start();
    })
    .catch((err) => {
      document.getElementById("message").textContent =
        "Could not load words.txt (" + err.message + ")";
    });
}
