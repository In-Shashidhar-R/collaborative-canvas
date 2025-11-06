import { CanvasView } from './canvas.js';
import { WS } from './websocket.js';

const canvasEl = document.getElementById('canvas');
const cursorsEl = document.getElementById('cursors');

const usersList = document.getElementById('users');
const fpsEl = document.getElementById('fps');
const latencyEl = document.getElementById('latency');
const opsCountEl = document.getElementById('opsCount');

const colorInput = document.getElementById('color');
const sizeInput = document.getElementById('size');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clearBtn = document.getElementById('clear');

const toolButtons = [...document.querySelectorAll('.tool-btn')];
let currentTool = 'brush';
toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    toolButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    view.setTool(currentTool);
  });
});

const view = new CanvasView(canvasEl, cursorsEl, {
  onLocalStroke: (evt) => ws.sendStrokeEvent(evt),
  onCursor: (pos) => ws.sendCursor(pos),
  onMetrics: (m) => { fpsEl.textContent = m.fps.toFixed(0); }
});

const ws = new WS({
  onInit({ self, users, ops }){
    view.setSelf(self);
    users.forEach(addUser);
    view.applyFullOps(ops);
    opsCountEl.textContent = String(ops.length);
  },
  onUserJoin({ user }){ addUser(user); },
  onUserLeave({ userId }){ removeUser(userId); view.removeCursor(userId); },
  onCursor(msg){ view.updateCursor(msg); },
  onStrokeBegin(msg){ view.remoteStrokeBegin(msg); },
  onStrokePoint(msg){ view.remoteStrokePoint(msg); },
  onStrokeCommit({ op }){ view.remoteStrokeCommit(op); opsCountEl.textContent = String(view.opCount()); },
  onRevoke({ id }){ view.revokeOp(id); opsCountEl.textContent = String(view.opCount()); },
  onReapply({ op }){ view.remoteStrokeCommit(op); opsCountEl.textContent = String(view.opCount()); },
  onLatency(ms){ latencyEl.textContent = String(ms); }
});

function addUser(user){
  const li = document.createElement('li');
  li.id = `user-${user.id}`;
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.color = user.color;
  li.appendChild(dot);
  const name = document.createElement('span');
  name.textContent = user.name;
  li.appendChild(name);
  usersList.appendChild(li);
}

function removeUser(userId){
  const li = document.getElementById(`user-${userId}`);
  if (li) li.remove();
}

view.setOptions({
  color: colorInput.value,
  size: Number(sizeInput.value),
  tool: currentTool
});

colorInput.addEventListener('input', () => view.setColor(colorInput.value));
sizeInput.addEventListener('input', () => view.setSize(Number(sizeInput.value)));

undoBtn.addEventListener('click', () => ws.emit('undo'));
redoBtn.addEventListener('click', () => ws.emit('redo'));
clearBtn.addEventListener('click', () => view.clearLocal());

// Resize canvas
const resize = () => view.resizeToParent();
window.addEventListener('resize', resize);
resize();
