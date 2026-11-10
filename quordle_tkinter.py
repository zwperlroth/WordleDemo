"""Quordle desktop version in Python using tkinter.

Solve four Wordle boards at once: every guess counts on each unsolved board.

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

WORD_LENGTH = 5
BOARDS = 4
MAX_GUESSES = 9
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


class QuordleGame:
    def __init__(self, targets=None):
        self.targets = targets or random.sample(WORDS, BOARDS)
        self.guesses = []
        # Index of the guess that solved each board, or None if unsolved
        self.solved_at = [None] * BOARDS

    def solved(self, board):
        return self.solved_at[board] is not None

    def solved_count(self):
        return sum(1 for i in self.solved_at if i is not None)

    def won(self):
        return self.solved_count() == BOARDS

    def over(self):
        return self.won() or len(self.guesses) >= MAX_GUESSES

    def history(self, board):
        """The (guess, score) rows shown on one board (it stops at its solving guess)."""
        end = self.solved_at[board] + 1 if self.solved(board) else len(self.guesses)
        return [(g, score_guess(g, self.targets[board])) for g in self.guesses[:end]]

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
        self.guesses.append(guess)
        for b in range(BOARDS):
            if not self.solved(b) and guess == self.targets[b]:
                self.solved_at[b] = len(self.guesses) - 1
        return None


# --------------------------------------------------------------- GUI layout & constants

CANVAS_WIDTH, CANVAS_HEIGHT = 400, 790
TILE, GAP = 28, 3
BOARD_GAP = 16
BOARD_W = WORD_LENGTH * TILE + (WORD_LENGTH - 1) * GAP
BOARD_H = MAX_GUESSES * TILE + (MAX_GUESSES - 1) * GAP
GRID_X = (CANVAS_WIDTH - (2 * BOARD_W + BOARD_GAP)) // 2
GRID_Y = 20


def board_origin(board):
    """Top-left corner of a board in the 2 x 2 layout."""
    return (
        GRID_X + (board % 2) * (BOARD_W + BOARD_GAP),
        GRID_Y + (board // 2) * (BOARD_H + BOARD_GAP),
    )


KEY_W, KEY_H, KEY_GAP = 30, 40, 6
WIDE_W = 52  # width of ENTER and DEL keys
KEY_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
]
KEYS_Y = GRID_Y + 2 * BOARD_H + BOARD_GAP + 50


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
MISSED = "#c94a4a"


# --------------------------------------------------------------- desktop app

class QuordleApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Quordle")
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
            text="Solve all 4 words\nin 9 guesses.\nType or click letters,\nEnter to guess.",
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

        self.game = QuordleGame()
        self.current = ""
        self.message = ""
        self.draw()

    def new_game(self):
        self.game = QuordleGame()
        self.current = ""
        self.message = ""
        self.draw()

    def letter_status(self):
        """Per board, the best rank seen for each letter. Solved boards count as blank."""
        rank = {GREEN: 3, YELLOW: 2, GRAY: 1}
        statuses = []
        for b in range(BOARDS):
            status = {}
            if not self.game.solved(b):
                for word, score in self.game.history(b):
                    for letter, result in zip(word, score):
                        status[letter] = max(status.get(letter, 0), rank[result])
            statuses.append(status)
        return statuses

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
                g = self.game
                if g.won():
                    self.message = "Solved all 4 in %d!" % len(g.guesses)
                elif g.over():
                    missed = [t for b, t in enumerate(g.targets) if not g.solved(b)]
                    self.message = "Missed: " + ", ".join(missed).upper()
                else:
                    self.message = "%d of 4 solved" % g.solved_count()
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

        game = self.game
        over = game.over()
        font = ("Helvetica", 15, "bold")

        # Draw the four boards
        for b in range(BOARDS):
            bx, by = board_origin(b)
            history = game.history(b)
            solved = game.solved(b)
            if solved or over:
                frame = COLORS[GREEN] if solved else MISSED
                self.canvas.create_rectangle(
                    bx - 5, by - 5, bx + BOARD_W + 5, by + BOARD_H + 5,
                    outline=frame, width=2,
                )
            for row in range(MAX_GUESSES):
                y = by + row * (TILE + GAP)
                for col in range(WORD_LENGTH):
                    x = bx + col * (TILE + GAP)
                    letter, fill, outline = "", EMPTY_FILL, EMPTY_LINE
                    if row < len(history):
                        word, score = history[row]
                        letter = word[col]
                        fill = outline = COLORS[score[col]]
                    elif not solved and not over and row == len(history) and col < len(self.current):
                        letter, outline = self.current[col], "#565758"
                    self.canvas.create_rectangle(
                        x, y, x + TILE, y + TILE, fill=fill, outline=outline, width=2
                    )
                    if letter:
                        self.canvas.create_text(
                            x + TILE // 2, y + TILE // 2,
                            text=letter.upper(), fill=TEXT_COLOR, font=font,
                        )

        # Status message
        if self.message:
            self.canvas.create_text(
                CANVAS_WIDTH // 2,
                KEYS_Y - 22,
                text=self.message,
                fill=TEXT_COLOR,
                font=("Helvetica", 14, "bold"),
            )

        # Keyboard tracker: each letter key is split into quarters, one per board
        # (top-left = board 1, top-right = 2, bottom-left = 3, bottom-right = 4)
        statuses = self.letter_status()
        rank_fill = {3: COLORS[GREEN], 2: COLORS[YELLOW], 1: "#3a3a3c", 0: KEY_UNUSED}
        for label, x, y, w in KEYS:
            if len(label) == 1:
                hw, hh = w / 2, KEY_H / 2
                for b, status in enumerate(statuses):
                    qx = x + (b % 2) * hw
                    qy = y + (b // 2) * hh
                    fill = rank_fill[status.get(label.lower(), 0)]
                    self.canvas.create_rectangle(
                        qx, qy, qx + hw, qy + hh, fill=fill, outline=fill
                    )
            else:
                self.canvas.create_rectangle(
                    x, y, x + w, y + KEY_H, fill=KEY_UNUSED, outline=KEY_UNUSED
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
    app = QuordleApp(app_root)
    app_root.mainloop()