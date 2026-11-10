"""Wordle desktop version in Python using tkinter.

Runs standalone or inside Thonny.
Reads words.txt from the same directory as this script.
"""

import os
import random
import tkinter as tk

# --------------------------------------------------------------- file loading

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_FILE = os.path.join(SCRIPT_DIR, "words.txt")

with open(WORDS_FILE, "r", encoding="utf-8") as f:
    WORDS = [line.strip().lower() for line in f if line.strip()]

# --------------------------------------------------------------- engine
# (scoring code kept unchanged from attached program)

WORD_LENGTH = 5
MAX_GUESSES = 6
STRICT_WORDS = True  # Reject guesses that are not in WORDS

GREEN = "G"
YELLOW = "Y"
GRAY = "."


def score_guess(guess, target):
    """Return a 5-char string of G/Y/. for guess against target."""
    result = [GRAY] * WORD_LENGTH
    remaining = list(target)
    for i in range(WORD_LENGTH):
        if guess[i] == target[i]:
            result[i] = GREEN
            remaining[i] = None
    for i in range(WORD_LENGTH):
        if result[i] == GREEN:
            continue
        if guess[i] in remaining:
            result[i] = YELLOW
            remaining[remaining.index(guess[i])] = None
    return "".join(result)


class WordleGame:
    def __init__(self, target=None):
        self.target = target or random.choice(WORDS)
        self.history = []
        self.won = False

    def over(self):
        return self.won or len(self.history) >= MAX_GUESSES

    def validate(self, guess):
        if self.over():
            return "Game over"
        if len(guess) != WORD_LENGTH or not guess.isalpha():
            return "Need %d letters" % WORD_LENGTH
        if STRICT_WORDS and guess not in WORDS:
            return "Not in word list"
        return None

    def guess(self, guess):
        error = self.validate(guess)
        if error:
            return error
        score = score_guess(guess, self.target)
        self.history.append((guess, score))
        if score == GREEN * WORD_LENGTH:
            self.won = True
        return None


# --------------------------------------------------------------- GUI layout & constants

CANVAS_WIDTH, CANVAS_HEIGHT = 400, 620
TILE, GAP = 56, 8
GRID_X = (CANVAS_WIDTH - (5 * TILE + 4 * GAP)) // 2
GRID_Y = 20

KEY_W, KEY_H, KEY_GAP = 30, 40, 6
WIDE_W = 52  # width of ENTER and DEL keys
KEY_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
]
KEYS_Y = GRID_Y + 6 * (TILE + GAP) + 40


def build_keys():
    """Return a list of (label, x, y, width) for drawing and hit detection."""
    keys = []
    for r, row in enumerate(KEY_ROWS):
        widths = [WIDE_W if k in ("ENTER", "DEL") else KEY_W for k in row]
        row_w = sum(widths) + (len(row) - 1) * KEY_GAP
        x = (CANVAS_WIDTH - row_w) // 2
        y = KEYS_Y + r * (KEY_H + KEY_GAP)
        for label, w in zip(row, widths):
            keys.append((label, x, y, w))
            x += w + KEY_GAP
    return keys


KEYS = build_keys()

COLORS = {GREEN: "#6aaa64", YELLOW: "#c9b458", GRAY: "#787c7e"}
EMPTY_FILL = "#121213"
EMPTY_LINE = "#3a3a3c"
KEY_UNUSED = "#818384"
TEXT_COLOR = "#ffffff"


# --------------------------------------------------------------- desktop app

class WordleApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Wordle")
        self.root.configure(bg=EMPTY_FILL)
        self.root.resizable(False, False)

        # Control panel (matches CodeSkulptor side controls)
        ctrl_frame = tk.Frame(root, bg=EMPTY_FILL, padx=10, pady=10)
        ctrl_frame.pack(side=tk.LEFT, fill=tk.Y)

        new_btn = tk.Button(
            ctrl_frame,
            text="New game",
            command=self.new_game,
            bg="#2c2c2e",
            fg="white",
            activebackground="#3a3a3c",
            activeforeground="white",
            relief=tk.RAISED,
            width=12,
        )
        new_btn.pack(pady=(10, 15))

        lbl1 = tk.Label(
            ctrl_frame,
            text="Type or click letters,\nEnter to guess.",
            bg=EMPTY_FILL,
            fg="#a0a0a0",
            justify=tk.LEFT,
            font=("Helvetica", 10),
        )
        lbl1.pack(anchor="w")

        # Game Canvas
        self.canvas = tk.Canvas(
            root,
            width=CANVAS_WIDTH,
            height=CANVAS_HEIGHT,
            bg=EMPTY_FILL,
            highlightthickness=0,
        )
        self.canvas.pack(side=tk.RIGHT)

        # Bindings
        self.canvas.bind("<Button-1>", self.on_click)
        self.root.bind("<Key>", self.on_keydown)

        self.game = WordleGame()
        self.current = ""
        self.message = ""
        self.draw()

    def new_game(self):
        self.game = WordleGame()
        self.current = ""
        self.message = ""
        self.draw()

    def letter_status(self):
        rank = {GREEN: 3, YELLOW: 2, GRAY: 1}
        status = {}
        for word, score in self.game.history:
            for letter, result in zip(word, score):
                status[letter] = max(status.get(letter, 0), rank[result])
        return status

    def press(self, label):
        if self.game.over():
            return
        if label == "DEL":
            self.current = self.current[:-1]
            self.message = ""
        elif label == "ENTER":
            error = self.game.guess(self.current)
            if error:
                self.message = error
            else:
                self.current = ""
                if self.game.won:
                    self.message = "Solved in %d!" % len(self.game.history)
                elif self.game.over():
                    self.message = "The word was " + self.game.target.upper()
                else:
                    self.message = ""
        elif len(self.current) < WORD_LENGTH:
            self.current += label.lower()
            self.message = ""
        self.draw()

    def on_keydown(self, event):
        keysym = event.keysym
        if keysym in ("BackSpace", "Delete"):
            self.press("DEL")
        elif keysym in ("Return", "KP_Enter"):
            self.press("ENTER")
        elif len(keysym) == 1 and keysym.isalpha():
            self.press(keysym.upper())

    def on_click(self, event):
        px, py = event.x, event.y
        for label, x, y, w in KEYS:
            if x <= px <= x + w and y <= py <= y + KEY_H:
                self.press(label)
                return

    def draw(self):
        self.canvas.delete("all")

        # Draw grid
        for row in range(MAX_GUESSES):
            y = GRID_Y + row * (TILE + GAP)
            for col in range(WORD_LENGTH):
                x = GRID_X + col * (TILE + GAP)
                if row < len(self.game.history):
                    word, score = self.game.history[row]
                    fill = COLORS[score[col]]
                    self.canvas.create_rectangle(
                        x, y, x + TILE, y + TILE, fill=fill, outline=fill, width=2
                    )
                    self.canvas.create_text(
                        x + TILE // 2,
                        y + TILE // 2,
                        text=word[col].upper(),
                        fill=TEXT_COLOR,
                        font=("Helvetica", 24, "bold"),
                    )
                elif row == len(self.game.history) and col < len(self.current):
                    self.canvas.create_rectangle(
                        x, y, x + TILE, y + TILE, fill=EMPTY_FILL, outline="#565758", width=2
                    )
                    self.canvas.create_text(
                        x + TILE // 2,
                        y + TILE // 2,
                        text=self.current[col].upper(),
                        fill=TEXT_COLOR,
                        font=("Helvetica", 24, "bold"),
                    )
                else:
                    self.canvas.create_rectangle(
                        x, y, x + TILE, y + TILE, fill=EMPTY_FILL, outline=EMPTY_LINE, width=2
                    )

        # Status message
        if self.message:
            self.canvas.create_text(
                GRID_X,
                KEYS_Y - 18,
                text=self.message,
                fill=TEXT_COLOR,
                anchor="w",
                font=("Helvetica", 14, "bold"),
            )

        # Keyboard tracker
        status = self.letter_status()
        rank_fill = {3: COLORS[GREEN], 2: COLORS[YELLOW], 1: "#3a3a3c", 0: KEY_UNUSED}
        for label, x, y, w in KEYS:
            fill = (
                rank_fill[status.get(label.lower(), 0)]
                if len(label) == 1
                else KEY_UNUSED
            )
            self.canvas.create_rectangle(
                x, y, x + w, y + KEY_H, fill=fill, outline=fill
            )
            font_size = 9 if len(label) > 1 else 12
            self.canvas.create_text(
                x + w // 2,
                y + KEY_H // 2,
                text=label,
                fill=TEXT_COLOR,
                font=("Helvetica", font_size, "bold"),
            )


if __name__ == "__main__":
    app_root = tk.Tk()
    app = WordleApp(app_root)
    app_root.mainloop()