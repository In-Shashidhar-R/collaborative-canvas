import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);
const app = express();
app.use(compression());
app.use(cors());
app.use(morgan('dev'));
app.use(express.static('client'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// In-memory state
const palette = [
  '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd',
  '#ff9ff3', '#54a0ff', '#00d2d3', '#c8d6e5', '#576574'
];

const state = {
  users: new Map(), // socketId -> { id, name, color }
  ops: [], // committed operations (stack)
  undone: [], // undone operations (stack)
  cursors: new Map(), // userId -> { x, y, tool, color }
  seq: 0
};

io.on('connection', (socket) => {
  const user = {
    id: nanoid(),
    name: 'User-' + (state.users.size + 1),
    color: palette[state.users.size % palette.length]
  };
  state.users.set(socket.id, user);

  // Send init
  socket.emit('init', {
    self: user,
    users: Array.from(state.users.values()),
    ops: state.ops
  });

  // Notify others
  socket.broadcast.emit('user:join', { user });

  socket.on('cursor', (payload) => {
    const { x, y, tool, color } = payload || {};
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.cursors.set(user.id, { x, y, tool, color });
    socket.broadcast.emit('cursor', { userId: user.id, x, y, tool, color });
  });

  // Streamed strokes
  socket.on('stroke:begin', (msg = {}) => {
    const meta = {
      tool: msg.tool === 'eraser' ? 'eraser' : 'brush',
      color: msg.color || user.color,
      size: Math.max(1, Math.min(100, msg.size || 4)),
      start: Array.isArray(msg.start) ? msg.start.slice(0,2) : [0,0],
      t: Date.now()
    };
    socket.broadcast.emit('stroke:begin', { userId: user.id, tempId: msg.tempId, meta });
  });

  socket.on('stroke:point', (msg = {}) => {
    const p = Array.isArray(msg.p) ? msg.p.slice(0,2) : null;
    if (!p) return;
    socket.broadcast.emit('stroke:point', { userId: user.id, tempId: msg.tempId, p, t: Date.now() });
  });

  socket.on('stroke:end', (msg = {}) => {
    // Commit operation
    const id = `${Date.now()}-${state.seq++}-${nanoid()}`;
    const op = {
      id,
      userId: user.id,
      tool: msg.tool === 'eraser' ? 'eraser' : 'brush',
      color: msg.color || user.color,
      size: Math.max(1, Math.min(100, msg.size || 4)),
      points: Array.isArray(msg.points) ? msg.points : [], // [[x,y], ...]
      committedAt: Date.now()
    };
    state.ops.push(op);
    io.emit('stroke:commit', { userId: user.id, id, tempId: msg.tempId, op });
  });

  socket.on('undo', () => {
    if (state.ops.length === 0) return;
    const op = state.ops.pop();
    state.undone.push(op);
    io.emit('revoke', { id: op.id });
  });

  socket.on('redo', () => {
    if (state.undone.length === 0) return;
    const op = state.undone.pop();
    state.ops.push(op);
    io.emit('reapply', { op });
  });

  socket.on('disconnect', () => {
    state.users.delete(socket.id);
    io.emit('user:leave', { userId: user.id });
    state.cursors.delete(user.id);
  });
});

server.listen(PORT, () => {
  console.log(`✓ Collaborative Canvas listening on http://localhost:${PORT}`);
});
