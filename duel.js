// Wordle Duel: two players open the same page, both press Ready, and race to
// find the same word. Each player sees the colors of the other's guesses,
// but not the letters.
//
// The two browsers talk directly over WebRTC using PeerJS. The free public
// PeerJS server only introduces them: whoever opens the room first claims
// the room's peer ID and becomes the host; the next visitor finds that ID
// taken and connects to it as the guest. The host picks the word and
// decides who won. Needs common.js loaded first.

"use strict";

const MAX_GUESSES = 6;
const ID_PREFIX = "zwperlroth-wordledemo-duel-";
const PING_MS = 2000;     // how often each side says "still here"
const TIMEOUT_MS = 8000;  // silence this long means the other player is gone

// The room comes from the URL (#name); without one everyone shares "main".
function roomName() {
  const raw = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  const clean = raw.replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return clean || "main";
}

// Tests can point PeerJS at a local server by setting window.DUEL_PEER_OPTIONS.
const PEER_OPTIONS = Object.assign({ debug: 0 }, window.DUEL_PEER_OPTIONS || {});

// ------------------------------------------------------------------ network

/**
 * Finds or creates the room and keeps one connection to the other player.
 * Calls handlers.onStatus(text), onConnected(role), onMessage(msg) and
 * onDisconnected().
 */
class DuelLink {
  constructor(room, handlers) {
    this.hostId = ID_PREFIX + room;
    // In a private room, remind the player to share this exact link
    this.waitingText = room === "main"
      ? "Waiting for an opponent to open this page…"
      : "Private room \u201c" + room + "\u201d. Send this page's link to your opponent.";
    this.handlers = handlers;
    this.peer = null;
    this.conn = null;
    this.role = null; // "host" or "guest"
    this.retryTimer = null;
    this.lastHeard = 0;
    window.addEventListener("pagehide", () => this.leave());
    // Heartbeat: a closed tab or a phone losing signal doesn't always close
    // the connection, so treat a silent opponent as gone.
    setInterval(() => {
      if (!this.conn || !this.conn.open) return;
      if (Date.now() - this.lastHeard > TIMEOUT_MS) {
        this.lost(this.conn);
      } else {
        this.send({ type: "ping" });
      }
    }, PING_MS);
    this.join();
  }

  status(text) {
    this.handlers.onStatus(text);
  }

  retry(ms) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.join(), ms);
  }

  join() {
    clearTimeout(this.retryTimer);
    if (this.peer) this.peer.destroy();
    this.conn = null;
    this.role = null;

    if (typeof Peer === "undefined") {
      this.status("Couldn't load the multiplayer library. Check your connection and reload.");
      return;
    }

    this.status("Connecting…");
    const peer = new Peer(this.hostId, PEER_OPTIONS);
    this.peer = peer;

    peer.on("open", () => {
      // We claimed the room's ID: we're the host.
      this.role = "host";
      this.status(this.waitingText);
    });

    peer.on("connection", (conn) => {
      if (this.conn) {
        // Room already has two players
        conn.on("open", () => {
          conn.send({ type: "full" });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.attach(conn);
    });

    peer.on("disconnected", () => {
      // Lost the PeerJS server (not the opponent). Keep the room ID.
      if (!peer.destroyed) peer.reconnect();
    });

    peer.on("error", (err) => {
      if (peer !== this.peer) return;
      if (err.type === "unavailable-id") {
        this.joinAsGuest();
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
        this.status("Can't reach the matchmaking server. Retrying…");
        this.retry(3000);
      } else if (err.type === "browser-incompatible") {
        this.status("This browser doesn't support WebRTC, which the duel needs.");
      } else {
        this.status("Connection problem (" + err.type + "). Retrying…");
        this.retry(2000);
      }
    });
  }

  joinAsGuest() {
    this.peer.destroy();
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    this.role = "guest";
    this.status("Joining the room…");

    peer.on("open", () => {
      const conn = peer.connect(this.hostId, { reliable: true });
      this.attach(conn);
      // If the host's ID is stale, the connection never opens: start over.
      this.retryTimer = setTimeout(() => {
        if (!conn.open) this.join();
      }, 10000);
    });

    peer.on("error", (err) => {
      if (peer !== this.peer) return;
      // "peer-unavailable": the host left just now. Try to become the host.
      this.retry(err.type === "peer-unavailable" ? 300 : 2000);
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on("open", () => {
      clearTimeout(this.retryTimer);
      this.lastHeard = Date.now();
      // The host welcomes the guest. A guest waits for that welcome, because
      // a full room answers with "full" instead.
      if (this.role === "host") {
        conn.send({ type: "welcome" });
        this.handlers.onConnected(this.role);
      }
    });
    conn.on("data", (msg) => {
      if (conn !== this.conn) return;
      this.lastHeard = Date.now();
      if (msg && msg.type === "ping") return;
      if (msg && msg.type === "welcome") {
        if (this.role === "guest") this.handlers.onConnected(this.role);
        return;
      }
      if (msg && msg.type === "full") {
        this.conn = null;
        this.peer.destroy();
        this.status("This room already has two players. Try a new private room.");
        return;
      }
      if (msg && msg.type === "bye") {
        this.lost(conn);
        return;
      }
      this.handlers.onMessage(msg);
    });
    conn.on("close", () => this.lost(conn));
    conn.on("error", () => this.lost(conn));
  }

  lost(conn) {
    if (conn !== this.conn) return;
    this.conn = null;
    conn.close();
    this.handlers.onDisconnected();
    if (this.role === "host") {
      this.status("Opponent left. " + this.waitingText);
    } else {
      // The host left: rejoin, and become the host if the room is free.
      this.retry(500);
    }
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  leave() {
    this.send({ type: "bye" });
    if (this.peer) this.peer.destroy();
  }
}

// ------------------------------------------------------------------ game

class DuelApp {
  constructor() {
    this.statusEl = document.getElementById("status");
    this.messageEl = document.getElementById("message");
    this.readyBtn = document.getElementById("ready");
    this.myTiles = this.buildBoard(document.getElementById("my-board"));
    this.oppTiles = this.buildBoard(document.getElementById("opp-board"));
    this.keys = buildKeyboard(document.getElementById("keyboard"), (l) => this.press(l));
    listenForKeys((label) => this.press(label));

    this.connected = false;
    this.wins = { me: 0, opp: 0 };
    this.resetRound();
    this.phase = "lobby"; // "lobby" (between rounds) or "playing"
    this.connectionText = "";

    this.readyBtn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.toggleReady();
    });
    document.getElementById("private-room").addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.openPrivateRoom();
    });

    this.link = new DuelLink(roomName(), {
      onStatus: (text) => { this.connectionText = text; this.draw(); },
      onConnected: (role) => this.onConnected(role),
      onMessage: (msg) => this.onMessage(msg),
      onDisconnected: () => this.onDisconnected(),
    });
    window.addEventListener("hashchange", () => location.reload());
    this.draw();
  }

  buildBoard(boardEl) {
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
    return tiles;
  }

  resetRound() {
    this.target = null;
    this.myHistory = []; // [guess, score]
    this.oppScores = []; // scores only: the opponent's letters stay secret
    this.current = "";
    this.result = null; // "me", "opp" or "draw" once decided
    this.meReady = false;
    this.oppReady = false;
  }

  // ---- helpers

  solved(scores) {
    return scores.length > 0 && scores[scores.length - 1] === GREEN.repeat(WORD_LENGTH);
  }

  myScores() {
    return this.myHistory.map(([, score]) => score);
  }

  done(scores) {
    return this.solved(scores) || scores.length >= MAX_GUESSES;
  }

  // ---- connection events

  onConnected(role) {
    this.connected = true;
    this.role = role;
    this.wins = { me: 0, opp: 0 };
    this.phase = "lobby";
    this.resetRound();
    this.message = "";
    this.connectionText = "";
    this.draw();
  }

  onDisconnected() {
    this.connected = false;
    if (this.phase === "playing") {
      this.message = "Your opponent left" + (this.target ? ". The word was " + this.target.toUpperCase() : "");
    }
    this.phase = "lobby";
    this.meReady = false;
    this.oppReady = false;
    this.draw();
  }

  onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready":
        this.oppReady = !!msg.ready;
        if (this.role === "host") this.maybeStart();
        break;
      case "start":
        if (this.role === "guest") this.startRound(String(msg.word));
        break;
      case "guess":
        if (this.phase !== "playing" || this.result) break;
        if (!/^[GY.]{5}$/.test(msg.score) || this.done(this.oppScores)) break;
        this.oppScores.push(msg.score);
        if (this.role === "host") this.judge();
        break;
      case "result":
        if (this.role === "guest") {
          // The host's "me" is our "opp"
          const flip = { host: "opp", guest: "me", draw: "draw" };
          this.finish(flip[msg.winner]);
        }
        break;
    }
    this.draw();
  }

  // ---- lobby

  toggleReady() {
    if (!this.connected || this.phase === "playing") return;
    this.meReady = !this.meReady;
    this.link.send({ type: "ready", ready: this.meReady });
    if (this.role === "host") this.maybeStart();
    this.draw();
  }

  /** Host only: start when both players are ready. */
  maybeStart() {
    if (this.phase !== "playing" && this.meReady && this.oppReady) {
      const word = randomWord();
      this.link.send({ type: "start", word });
      this.startRound(word);
    }
  }

  startRound(word) {
    this.resetRound();
    this.target = word;
    this.phase = "playing";
    this.message = "Go!";
    this.draw();
  }

  openPrivateRoom() {
    const code = Math.random().toString(36).slice(2, 8);
    location.hash = code; // reloads via hashchange
  }

  // ---- playing

  press(label) {
    if (this.phase !== "playing" || this.done(this.myScores())) return;
    if (label === "DEL") {
      this.current = this.current.slice(0, -1);
      this.message = "";
    } else if (label === "ENTER") {
      const error = checkWord(this.current);
      if (error) {
        this.message = error;
      } else {
        const score = scoreGuess(this.current, this.target);
        this.myHistory.push([this.current, score]);
        this.current = "";
        this.message = "";
        this.link.send({ type: "guess", score });
        if (this.role === "host") this.judge();
        if (!this.result && !this.solved(this.myScores()) && this.done(this.myScores())) {
          this.message = "Out of guesses. Waiting for your opponent…";
        }
      }
    } else if (this.current.length < WORD_LENGTH) {
      this.current += label.toLowerCase();
      this.message = "";
    }
    this.draw();
  }

  /** Host only: decide the round as soon as someone solves or both run out. */
  judge() {
    if (this.result) return;
    let winner = null;
    if (this.solved(this.myScores())) winner = "me";
    else if (this.solved(this.oppScores)) winner = "opp";
    else if (this.done(this.myScores()) && this.done(this.oppScores)) winner = "draw";
    if (!winner) return;
    const asHost = { me: "host", opp: "guest", draw: "draw" };
    this.link.send({ type: "result", winner: asHost[winner] });
    this.finish(winner);
  }

  finish(winner) {
    if (this.result || !winner) return;
    this.result = winner;
    this.phase = "lobby";
    this.meReady = false;
    this.oppReady = false;
    const word = this.target.toUpperCase();
    if (winner === "me") {
      this.wins.me++;
      this.message = "You win! The word was " + word;
    } else if (winner === "opp") {
      this.wins.opp++;
      this.message = "Opponent won! The word was " + word;
    } else {
      this.message = "Nobody got it. The word was " + word;
    }
  }

  // ---- drawing

  statusText() {
    if (!this.connected) return this.connectionText;
    if (this.phase === "playing") {
      const left = MAX_GUESSES - this.oppScores.length;
      if (this.solved(this.oppScores)) return "Your opponent solved it";
      return left > 0 ? "Opponent has " + left + " guess" + (left === 1 ? "" : "es") + " left"
                      : "Your opponent is out of guesses";
    }
    if (this.meReady && this.oppReady) return "Starting…";
    if (this.meReady) return "Waiting for your opponent to press Ready…";
    if (this.oppReady) return "Your opponent is ready. Press Ready to start!";
    const round = this.wins.me + this.wins.opp > 0 || this.result ? "for the next round" : "to start";
    return "Opponent connected. Press Ready " + round + ".";
  }

  draw() {
    this.statusEl.textContent = this.statusText();
    this.messageEl.textContent = this.message || "";
    document.getElementById("my-score").textContent = this.wins.me;
    document.getElementById("opp-score").textContent = this.wins.opp;

    // Ready button
    const btn = this.readyBtn;
    btn.disabled = !this.connected || this.phase === "playing";
    btn.textContent = this.phase === "playing" ? "Playing…" : this.meReady ? "Not ready" : "Ready";
    btn.classList.toggle("is-ready", this.meReady);

    // My board: letters and colors
    const playing = this.phase === "playing";
    for (let row = 0; row < MAX_GUESSES; row++) {
      for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = this.myTiles[row][col];
        if (row < this.myHistory.length) {
          const [word, score] = this.myHistory[row];
          tile.className = "tile " + SCORE_CLASS[score[col]];
          tile.textContent = word[col];
        } else if (playing && row === this.myHistory.length && col < this.current.length) {
          tile.className = "tile typed";
          tile.textContent = this.current[col];
        } else {
          tile.className = "tile";
          tile.textContent = "";
        }
      }
    }

    // Opponent's board: colors only
    for (let row = 0; row < MAX_GUESSES; row++) {
      for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = this.oppTiles[row][col];
        const score = this.oppScores[row];
        tile.className = score ? "tile " + SCORE_CLASS[score[col]] : "tile";
      }
    }

    // Keyboard tracker for my guesses
    const rank = { [GREEN]: 3, [YELLOW]: 2, [GRAY]: 1 };
    const status = {};
    for (const [word, score] of this.myHistory) {
      for (let i = 0; i < WORD_LENGTH; i++) {
        status[word[i]] = Math.max(status[word[i]] || 0, rank[score[i]]);
      }
    }
    const rankClass = { 3: "G", 2: "Y", 1: "gray" };
    for (const [label, key] of Object.entries(this.keys)) {
      const base = label.length > 1 ? "key wide" : "key";
      const cls = rankClass[status[label.toLowerCase()]];
      key.className = cls ? base + " " + cls : base;
    }
  }
}

// ------------------------------------------------------------------ startup

new Music(document.getElementById("music"));
loadWordsThen(() => new DuelApp());
