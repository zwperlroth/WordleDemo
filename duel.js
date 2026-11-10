// Wordle Duel for up to 3 players: everyone opens the same page, presses
// Ready, and races to find the same word. Each player sees the colors of
// the others' guesses, but not their letters.
//
// The browsers talk directly over WebRTC using PeerJS. The free public
// PeerJS server only introduces them: whoever opens the room first claims
// the room's peer ID and becomes the host (Player 1); later visitors find
// that ID taken and connect to the host as guests (Players 2 and 3). The
// host keeps the official game state, picks the word, decides who won, and
// sends the state to everyone after every change. Needs common.js loaded first.

"use strict";

const MAX_GUESSES = 6;
const MAX_PLAYERS = 3;
const GUEST_SEATS = [2, 3]; // the host is always seat 1
const ID_PREFIX = "zwperlroth-wordledemo-duel-";
const PING_MS = 2000;     // how often each side says "still here"
const TIMEOUT_MS = 8000;  // silence this long means that player is gone

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
 * Finds or creates the room. The host keeps a connection to each guest; a
 * guest keeps one connection to the host. Handlers:
 *   onStatus(text)             connection progress while not in a room
 *   onJoined(role, seat)       we're in: role "host" (seat 1) or "guest"
 *   onGuestJoined(seat)        host only
 *   onGuestLeft(seat)          host only
 *   onMessage(fromSeat, msg)   a game message
 *   onLostHost()               guest only: the host went away
 */
class RoomLink {
  constructor(room, handlers) {
    this.hostId = ID_PREFIX + room;
    this.handlers = handlers;
    this.peer = null;
    this.role = null;          // "host" or "guest"
    this.guests = new Map();   // host only: seat -> {conn, lastHeard}
    this.hostConn = null;      // guest only
    this.hostHeard = 0;
    this.retryTimer = null;
    window.addEventListener("pagehide", () => this.leave());
    // Heartbeat: a closed tab or a phone losing signal doesn't always close
    // the connection, so treat a silent player as gone.
    setInterval(() => this.heartbeat(), PING_MS);
    this.join();
  }

  status(text) {
    this.handlers.onStatus(text);
  }

  retry(ms) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.join(), ms);
  }

  // ---- joining

  join() {
    clearTimeout(this.retryTimer);
    if (this.peer) this.peer.destroy();
    this.role = null;
    this.guests.clear();
    this.hostConn = null;

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
      this.handlers.onJoined("host", 1);
    });

    peer.on("connection", (conn) => this.acceptGuest(conn));

    peer.on("disconnected", () => {
      // Lost the PeerJS server (not the other players). Keep the room ID.
      if (!peer.destroyed) peer.reconnect();
    });

    peer.on("error", (err) => {
      if (peer !== this.peer) return;
      if (err.type === "unavailable-id") {
        this.joinAsGuest();
      } else if (err.type === "peer-unavailable") {
        // A guest we tried to reach is gone; nothing to do.
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(err.type)) {
        if (this.role !== "host") {
          this.status("Can't reach the matchmaking server. Retrying…");
          this.retry(3000);
        }
      } else if (err.type === "browser-incompatible") {
        this.status("This browser doesn't support WebRTC, which the duel needs.");
      } else if (this.role !== "host") {
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
      this.hostConn = conn;
      // If the host's ID is stale, the connection never opens: start over.
      this.retryTimer = setTimeout(() => {
        if (!conn.open) this.join();
      }, 10000);

      conn.on("open", () => {
        clearTimeout(this.retryTimer);
        this.hostHeard = Date.now();
      });
      conn.on("data", (msg) => {
        if (conn !== this.hostConn || !msg || typeof msg !== "object") return;
        this.hostHeard = Date.now();
        if (msg.type === "ping") return;
        if (msg.type === "welcome") {
          this.handlers.onJoined("guest", msg.seat);
        } else if (msg.type === "full") {
          this.hostConn = null;
          peer.destroy();
          this.status("This room already has " + MAX_PLAYERS + " players. Try a new private room.");
        } else if (msg.type === "bye") {
          this.lostHost(conn);
        } else {
          this.handlers.onMessage(1, msg);
        }
      });
      conn.on("close", () => this.lostHost(conn));
      conn.on("error", () => this.lostHost(conn));
    });

    peer.on("error", (err) => {
      if (peer !== this.peer) return;
      // "peer-unavailable": the host left just now. Try to become the host.
      this.retry(err.type === "peer-unavailable" ? 300 : 2000);
    });
  }

  // ---- host side

  acceptGuest(conn) {
    conn.on("open", () => {
      const seat = GUEST_SEATS.find((s) => !this.guests.has(s));
      if (!seat) {
        conn.send({ type: "full" });
        setTimeout(() => conn.close(), 500);
        return;
      }
      this.guests.set(seat, { conn, lastHeard: Date.now() });
      conn.send({ type: "welcome", seat });
      this.handlers.onGuestJoined(seat);
    });
    conn.on("data", (msg) => {
      const seat = this.seatOf(conn);
      if (!seat || !msg || typeof msg !== "object") return;
      this.guests.get(seat).lastHeard = Date.now();
      if (msg.type === "ping") return;
      if (msg.type === "bye") this.dropGuest(seat);
      else this.handlers.onMessage(seat, msg);
    });
    conn.on("close", () => this.dropGuest(this.seatOf(conn)));
    conn.on("error", () => this.dropGuest(this.seatOf(conn)));
  }

  seatOf(conn) {
    for (const [seat, g] of this.guests) if (g.conn === conn) return seat;
    return null;
  }

  dropGuest(seat) {
    const g = seat && this.guests.get(seat);
    if (!g) return;
    this.guests.delete(seat);
    g.conn.close();
    this.handlers.onGuestLeft(seat);
  }

  // ---- guest side

  lostHost(conn) {
    if (conn !== this.hostConn) return;
    this.hostConn = null;
    conn.close();
    this.handlers.onLostHost();
    // Rejoin, and become the host if the room is free.
    this.retry(300 + Math.random() * 400);
  }

  // ---- both

  heartbeat() {
    const now = Date.now();
    if (this.role === "host") {
      for (const [seat, g] of [...this.guests]) {
        if (now - g.lastHeard > TIMEOUT_MS) this.dropGuest(seat);
        else if (g.conn.open) g.conn.send({ type: "ping" });
      }
    } else if (this.hostConn && this.hostConn.open) {
      if (now - this.hostHeard > TIMEOUT_MS) this.lostHost(this.hostConn);
      else this.hostConn.send({ type: "ping" });
    }
  }

  /** Guest: send to the host. */
  toHost(msg) {
    if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  /** Host: send to every guest. */
  broadcast(msg) {
    for (const { conn } of this.guests.values()) if (conn.open) conn.send(msg);
  }

  leave() {
    if (this.role === "host") this.broadcast({ type: "bye" });
    else this.toHost({ type: "bye" });
    if (this.peer) this.peer.destroy();
  }
}

// ------------------------------------------------------------------ game

/*
 * The host's state, copied to every guest after each change:
 *   players: { seat: {ready, wins} }   everyone in the room
 *   round: null or {
 *     n,          round number
 *     word,       the answer
 *     seats,      who is playing this round
 *     scores,     { seat: [score, ...] }  colors only, never letters
 *     winner,     null while playing, then a seat, "draw" or "cancelled"
 *   }
 */
class DuelApp {
  constructor() {
    this.statusEl = document.getElementById("status");
    this.messageEl = document.getElementById("message");
    this.readyBtn = document.getElementById("ready");
    this.myTiles = this.buildBoard(document.getElementById("my-board"));
    this.oppSlots = this.buildOpponentSlots(document.getElementById("opponents"));
    this.keys = buildKeyboard(document.getElementById("keyboard"), (l) => this.press(l));
    listenForKeys((label) => this.press(label));

    this.role = null;
    this.mySeat = null;
    this.state = null;      // null until we're in a room
    this.connectionText = "";
    this.message = "";
    // My own guesses with letters, for the round number in localRound
    this.localRound = 0;
    this.myHistory = [];
    this.current = "";
    this.seenResult = 0;

    this.readyBtn.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.toggleReady();
    });
    document.getElementById("private-room").addEventListener("click", (e) => {
      e.currentTarget.blur();
      location.hash = Math.random().toString(36).slice(2, 8); // reloads via hashchange
    });
    window.addEventListener("hashchange", () => location.reload());

    const room = roomName();
    this.waitingText = room === "main"
      ? "Waiting for other players to open this page…"
      : "Private room “" + room + "”. Send this page's link to the other players.";

    this.link = new RoomLink(room, {
      onStatus: (text) => { this.connectionText = text; this.draw(); },
      onJoined: (role, seat) => this.onJoined(role, seat),
      onGuestJoined: (seat) => this.onGuestJoined(seat),
      onGuestLeft: (seat) => this.onGuestLeft(seat),
      onMessage: (seat, msg) => this.onMessage(seat, msg),
      onLostHost: () => this.onLostHost(),
    });
    this.draw();
  }

  // ---- building the page

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

  buildOpponentSlots(container) {
    const slots = [];
    for (let i = 0; i < MAX_PLAYERS - 1; i++) {
      const fig = document.createElement("figure");
      fig.className = "duel-board opponent";
      const grid = document.createElement("div");
      grid.className = "grid";
      const caption = document.createElement("figcaption");
      fig.append(grid, caption);
      container.appendChild(fig);
      slots.push({ fig, caption, tiles: this.buildBoard(grid) });
    }
    return slots;
  }

  // ---- helpers

  solved(scores) {
    return scores.length > 0 && scores[scores.length - 1] === GREEN.repeat(WORD_LENGTH);
  }

  done(scores) {
    return this.solved(scores) || scores.length >= MAX_GUESSES;
  }

  name(seat) {
    return seat === this.mySeat ? "You" : "Player " + seat;
  }

  seats() {
    return this.state ? Object.keys(this.state.players).map(Number).sort() : [];
  }

  /** The round, if one is being played right now. */
  liveRound() {
    const r = this.state && this.state.round;
    return r && !r.winner ? r : null;
  }

  amPlaying() {
    const r = this.liveRound();
    return !!r && r.seats.includes(this.mySeat) && !this.done(this.myHistory.map(([, s]) => s));
  }

  // ---- connection events

  onJoined(role, seat) {
    this.role = role;
    this.mySeat = seat;
    this.message = "";
    this.myHistory = [];
    this.current = "";
    this.localRound = 0;
    this.seenResult = 0;
    if (role === "host") {
      this.state = { players: { 1: { ready: false, wins: 0 } }, round: null, nextRound: 1 };
      this.commit();
    } else {
      this.state = null; // arrives from the host right after the welcome
      this.draw();
    }
  }

  onLostHost() {
    if (this.liveRound()) {
      this.message = "The host left. The word was " + this.state.round.word.toUpperCase();
    }
    this.state = null;
    this.mySeat = null;
    this.draw();
  }

  /** Host only. */
  onGuestJoined(seat) {
    this.state.players[seat] = { ready: false, wins: 0 };
    this.commit();
  }

  /** Host only. */
  onGuestLeft(seat) {
    delete this.state.players[seat];
    const r = this.liveRound();
    if (r && r.seats.includes(seat)) {
      r.seats = r.seats.filter((s) => s !== seat);
      if (r.seats.length < 2) r.winner = "cancelled";
      else this.judge(null);
    }
    this.commit();
  }

  onMessage(fromSeat, msg) {
    if (this.role === "guest") {
      if (msg.type === "state" && msg.state) {
        this.state = msg.state;
        this.applyState();
      }
      return;
    }
    // Host: apply a guest's action
    const player = this.state.players[fromSeat];
    if (!player) return;
    if (msg.type === "ready") {
      if (!this.liveRound()) {
        player.ready = !!msg.ready;
        this.maybeStart();
      }
    } else if (msg.type === "guess") {
      this.recordGuess(fromSeat, msg.score);
    }
    this.commit();
  }

  // ---- host: game rules

  /** Host: send the state to everyone and redraw. */
  commit() {
    this.link.broadcast({ type: "state", state: this.state });
    this.applyState();
  }

  /** Host: start when at least 2 players are here and all are ready. */
  maybeStart() {
    const seats = this.seats();
    if (this.liveRound() || seats.length < 2) return;
    if (!seats.every((s) => this.state.players[s].ready)) return;
    for (const s of seats) this.state.players[s].ready = false;
    const scores = {};
    for (const s of seats) scores[s] = [];
    this.state.round = {
      n: this.state.nextRound++,
      word: randomWord(),
      seats,
      scores,
      winner: null,
    };
  }

  recordGuess(seat, score) {
    const r = this.liveRound();
    if (!r || !r.seats.includes(seat)) return;
    if (!/^[GY.]{5}$/.test(score) || this.done(r.scores[seat])) return;
    r.scores[seat].push(score);
    this.judge(seat);
  }

  /** Host: the first to solve wins; if everyone runs out, it's a draw. */
  judge(seat) {
    const r = this.liveRound();
    if (!r) return;
    if (seat && this.solved(r.scores[seat])) {
      r.winner = seat;
      this.state.players[seat].wins++;
    } else if (r.seats.every((s) => this.done(r.scores[s]))) {
      r.winner = "draw";
    }
  }

  // ---- my actions

  toggleReady() {
    if (!this.state || this.liveRound() || this.seats().length < 2) return;
    const me = this.state.players[this.mySeat];
    if (this.role === "host") {
      me.ready = !me.ready;
      this.maybeStart();
      this.commit();
    } else {
      this.link.toHost({ type: "ready", ready: !me.ready });
    }
  }

  press(label) {
    if (!this.amPlaying()) return;
    if (label === "DEL") {
      this.current = this.current.slice(0, -1);
      this.message = "";
    } else if (label === "ENTER") {
      const error = checkWord(this.current);
      if (error) {
        this.message = error;
      } else {
        const score = scoreGuess(this.current, this.liveRound().word);
        this.myHistory.push([this.current, score]);
        this.current = "";
        this.message = "";
        if (this.myHistory.length >= MAX_GUESSES && score !== GREEN.repeat(WORD_LENGTH)) {
          this.message = "Out of guesses. Waiting for the others…";
        }
        if (this.role === "host") {
          this.recordGuess(this.mySeat, score);
          this.commit();
          return;
        }
        this.link.toHost({ type: "guess", score });
      }
    } else if (this.current.length < WORD_LENGTH) {
      this.current += label.toLowerCase();
      this.message = "";
    }
    this.draw();
  }

  // ---- reacting to the state

  /** Update my own view after the state changes, then redraw. */
  applyState() {
    const r = this.state && this.state.round;
    if (r && this.localRound === 0 && this.seenResult === 0 && !r.seats.includes(this.mySeat)) {
      // Just joined a room that already played: don't announce an old round
      this.localRound = r.n;
      if (r.winner) this.seenResult = r.n;
      else this.message = "A round is in progress. You'll play in the next one.";
    }
    if (r && r.n !== this.localRound) {
      // A new round has started
      this.localRound = r.n;
      this.myHistory = [];
      this.current = "";
      this.message = r.seats.includes(this.mySeat)
        ? "Go!"
        : "A round is in progress. You'll play in the next one.";
    }
    if (r && r.winner && this.seenResult !== r.n) {
      this.seenResult = r.n;
      this.current = "";
      const word = r.word.toUpperCase();
      if (r.winner === "draw") this.message = "Nobody got it. The word was " + word;
      else if (r.winner === "cancelled") this.message = "Round over: not enough players left. The word was " + word;
      else if (r.winner === this.mySeat) this.message = "You win! The word was " + word;
      else this.message = this.name(r.winner) + " won! The word was " + word;
    }
    this.draw();
  }

  // ---- drawing

  statusText() {
    if (!this.state) return this.connectionText;
    const seats = this.seats();
    const r = this.liveRound();
    if (r) return "Round " + r.n + ": first to find the word wins.";
    if (seats.length < 2) return this.waitingText;
    const notReady = seats.filter((s) => !this.state.players[s].ready);
    const count = seats.length + " of " + MAX_PLAYERS + " players here. ";
    if (notReady.length === 0) return "Starting…";
    if (!notReady.includes(this.mySeat)) {
      return count + "Waiting for " + notReady.map((s) => this.name(s)).join(" and ") + " to press Ready…";
    }
    return count + "Press Ready when everyone's in.";
  }

  draw() {
    this.statusEl.textContent = this.statusText();
    this.messageEl.textContent = this.message || "";

    const state = this.state;
    const round = state && state.round;
    const live = this.liveRound();
    const players = state ? state.players : {};
    const me = players[this.mySeat];

    // Ready button
    const btn = this.readyBtn;
    btn.disabled = !state || !!live || this.seats().length < 2;
    btn.textContent = live ? "Playing…" : me && me.ready ? "Not ready" : "Ready";
    btn.classList.toggle("is-ready", !!(me && me.ready && !live));

    // My caption
    document.getElementById("my-name").textContent =
      this.mySeat ? "You (Player " + this.mySeat + ")" : "You";
    document.getElementById("my-score").textContent = me ? me.wins : 0;
    document.getElementById("my-ready").hidden = !(me && me.ready && !live);

    // My board: letters and colors
    for (let row = 0; row < MAX_GUESSES; row++) {
      for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = this.myTiles[row][col];
        if (row < this.myHistory.length) {
          const [word, score] = this.myHistory[row];
          tile.className = "tile " + SCORE_CLASS[score[col]];
          tile.textContent = word[col];
        } else if (live && row === this.myHistory.length && col < this.current.length) {
          tile.className = "tile typed";
          tile.textContent = this.current[col];
        } else {
          tile.className = "tile";
          tile.textContent = "";
        }
      }
    }

    // Opponents' boards: colors only
    const others = this.seats().filter((s) => s !== this.mySeat);
    this.oppSlots.forEach((slot, i) => {
      const seat = others[i];
      const p = seat && players[seat];
      const scores = (p && round && round.scores[seat]) || [];
      slot.fig.classList.toggle("empty", !p);
      slot.fig.classList.toggle("winner", !!(p && round && round.winner === seat));
      slot.caption.textContent = "";
      if (p) {
        const label = document.createElement("span");
        label.textContent = "Player " + seat + " ";
        const wins = document.createElement("span");
        wins.className = "score";
        wins.textContent = p.wins;
        slot.caption.append(label, wins);
        if (p.ready && !live) {
          const ready = document.createElement("span");
          ready.className = "ready-tag";
          ready.textContent = "Ready";
          slot.caption.append(" ", ready);
        } else if (live && !live.seats.includes(seat)) {
          slot.caption.append(" (next round)");
        }
      } else {
        slot.caption.textContent = "Open seat";
      }
      for (let row = 0; row < MAX_GUESSES; row++) {
        for (let col = 0; col < WORD_LENGTH; col++) {
          const score = scores[row];
          slot.tiles[row][col].className = score ? "tile " + SCORE_CLASS[score[col]] : "tile";
        }
      }
    });

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
