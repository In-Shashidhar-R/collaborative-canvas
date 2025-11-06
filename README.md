# 🖊️ Real-Time Collaborative Drawing Canvas

Vanilla JS + HTML5 Canvas + Node.js (Express + Socket.IO)

## 🚀 Quick Start

```bash
npm install
npm start
# open http://localhost:3000
# open a second tab/window to see multi-user sync
```

## ✨ Features

- Brush & Eraser with color/width picker
- Real-time streams (see strokes while they're drawn)
- Live cursors with per-user colors
- Global Undo/Redo (server-authoritative)
- Online users list
- Conflict-safe stroke ordering via server timestamps
- Smooth strokes (quadratic Bézier path smoothing)
- Efficient redraw (incremental, offscreen buffer)
- Pretty, responsive UI (no frameworks)

## 🧪 Test Multi-User

- Open two different browsers or incognito windows on `http://localhost:3000`
- Draw from both—watch in real-time
- Try Undo/Redo (affects global canvas order)

## 🧰 Scripts

- `npm start` – run server (serves client)
- `npm run dev` – same as start with NODE_ENV=development

## 🌐 Deploy

- **Render/Heroku/Railway**: Create a Node app, set start command to `npm start`.
- **Vercel**: Not ideal with WebSockets server. Prefer Render/Railway/Heroku.
- Set **PORT** env if your platform assigns one.

## 🧩 Known Limitations

- In-memory state only (no DB). Restart clears canvas.
- Undo/Redo is global LIFO (latest applied stroke wins).
- No authentication.

## ⏱️ Time Spent

~6–7 hours (design + coding + docs + styling).

