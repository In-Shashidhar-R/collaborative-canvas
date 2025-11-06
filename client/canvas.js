/**
 * CanvasView manages drawing and rendering.
 * - Offscreen buffer for committed ops
 * - Overlay for active strokes
 * - Remote cursors rendering with DOM
 */
export class CanvasView {
  constructor(canvas, cursorsRoot, callbacks){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d');
    this.overlay = document.createElement('canvas');
    this.octx = this.overlay.getContext('2d');
    this.canvas.parentElement.appendChild(this.overlay);

    this.cursorsRoot = cursorsRoot;
    this.callbacks = callbacks;
    this.self = null;

    this.opts = { color:'#ff6b6b', size:6, tool:'brush' };
    this.down = false;
    this.tempId = null;
    this.localPoints = [];
    this.remoteActive = new Map(); // temp strokes by userId+tempId
    this.ops = []; // committed ops stack

    this._setupPointer();
    this._setupRAF();
  }

  setSelf(self){ this.self = self; }
  setOptions(o){ this.opts = { ...this.opts, ...o }; }
  setColor(c){ this.opts.color = c; }
  setSize(s){ this.opts.size = s; }
  setTool(t){ this.opts.tool = t; }
  opCount(){ return this.ops.length; }

  applyFullOps(ops){
    this.ops = ops.slice();
    this._redrawBuffer();
  }

  remoteStrokeBegin({ userId, tempId, meta }){
    this.remoteActive.set(`${userId}:${tempId}`, { ...meta, points:[meta.start] });
  }
  remoteStrokePoint({ userId, tempId, p }){
    const key = `${userId}:${tempId}`;
    const s = this.remoteActive.get(key);
    if (!s) return;
    s.points.push(p);
    this._drawStroke(this.octx, s, false);
  }
  remoteStrokeCommit(op){
    // remove temp
    for (const k of Array.from(this.remoteActive.keys())){
      const s = this.remoteActive.get(k);
      if (s && s.userId === op.userId) this.remoteActive.delete(k);
    }
    this.ops.push(op);
    this._drawStroke(this.bctx, op, true);
    this._flushComposite();
  }

  revokeOp(id){
    const idx = this.ops.findIndex(o => o.id === id);
    if (idx !== -1){
      this.ops.splice(idx, 1);
      this._redrawBuffer();
    }
  }

  removeCursor(userId){
    const el = document.getElementById(`cursor-${userId}`);
    if (el) el.remove();
  }

  updateCursor({ userId, x, y, tool, color }){
    let el = document.getElementById(`cursor-${userId}`);
    if (!el){
      el = document.createElement('div');
      el.id = `cursor-${userId}`;
      el.className = 'cursor';
      el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 2l7 20 2-7 7-2L3 2z" fill="currentColor"/></svg><span class="badge"></span>`;
      this.cursorsRoot.appendChild(el);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color;
    el.querySelector('.badge').textContent = tool;
  }

  onPointerMove(e){
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // send cursor (throttled by RAF via this._cursorPending)
    this._cursorPending = { x, y, tool: this.opts.tool, color: this.opts.color };

    if (!this.down) return;
    const p = [x, y];
    this.localPoints.push(p);
    this._drawLocalIncrement(p);
    this.callbacks.onLocalStroke?.({ type:'stroke:point', tempId: this.tempId, p, t: performance.now() });
  }

  _setupPointer(){
    const handlerDown = (e) => {
      e.preventDefault();
      this.down = true;
      this.tempId = Math.random().toString(36).slice(2);
      this.localPoints = [];
      const start = this._eventPoint(e);
      this.localPoints.push(start);
      this.callbacks.onLocalStroke?.({ type:'stroke:begin', tempId: this.tempId,
        tool: this.opts.tool, color: this.opts.color, size: this.opts.size, start, t: performance.now()
      });
    };
    const handlerUp = (e) => {
      if (!this.down) return;
      this.down = false;
      const op = {
        id: null, userId: this.self?.id, tool: this.opts.tool, color: this.opts.color,
        size: this.opts.size, points: this.localPoints.slice()
      };
      // Draw on buffer locally for optimistic feel
      this._drawStroke(this.bctx, op, true);
      this._flushComposite();
      this.callbacks.onLocalStroke?.({ type:'stroke:end', tempId: this.tempId,
        tool: this.opts.tool, color: this.opts.color, size: this.opts.size, points: op.points });
      this.tempId = null;
      this.localPoints = [];
    };

    const el = this.canvas;
    el.addEventListener('pointerdown', handlerDown);
    window.addEventListener('pointermove', (e)=>this.onPointerMove(e));
    window.addEventListener('pointerup', handlerUp);
    window.addEventListener('pointercancel', handlerUp);
  }

  _eventPoint(e){
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _setupRAF(){
    let last = performance.now();
    const loop = () => {
      // Cursor broadcast once per frame
      if (this._cursorPending){
        this.callbacks.onCursor?.(this._cursorPending);
        this._cursorPending = null;
      }
      // Blit buffer + overlay
      this._flushComposite();

      // FPS
      const now = performance.now();
      const dt = now - last;
      last = now;
      const fps = 1000 / dt;
      this.callbacks.onMetrics?.({ fps });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _flushComposite(){
    // Resize overlay to canvas size
    if (this.overlay.width !== this.canvas.width || this.overlay.height !== this.canvas.height){
      this.overlay.width = this.canvas.width;
      this.overlay.height = this.canvas.height;
    }
    // Paint buffer onto visible canvas then overlay
    this.ctx.clearRect(0,0,this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.buffer, 0, 0);
    this.ctx.drawImage(this.overlay, 0, 0);
  }

  _redrawBuffer(){
    this.bctx.clearRect(0,0,this.buffer.width, this.buffer.height);
    for (const op of this.ops){
      this._drawStroke(this.bctx, op, true);
    }
    this._flushComposite();
  }

  _drawLocalIncrement(p){
    const s = {
      tool: this.opts.tool, color: this.opts.color, size: this.opts.size,
      points: this.localPoints
    };
    // Draw current segment on overlay for responsiveness
    this.octx.clearRect(0,0,this.overlay.width, this.overlay.height);
    this._drawStroke(this.octx, s, false);
  }

  _drawStroke(ctx, s, commit){
    if (!s.points || s.points.length < 1) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.size || 4;
    ctx.strokeStyle = s.color || '#fff';
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';

    const pts = s.points;
    ctx.beginPath();
    if (pts.length === 1){
      const [x,y] = pts[0];
      ctx.moveTo(x,y); ctx.lineTo(x+0.01, y+0.01);
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i=1; i<pts.length-1; i++){
        const [x0,y0] = pts[i];
        const [x1,y1] = pts[i+1];
        const cx = (x0 + x1)/2;
        const cy = (y0 + y1)/2;
        ctx.quadraticCurveTo(x0, y0, cx, cy);
      }
      const [lx,ly] = pts[pts.length-1];
      ctx.lineTo(lx, ly);
    }
    ctx.stroke();
    ctx.restore();

    if (commit){
      // committed strokes are on buffer; clear overlay remnants
      this.octx.clearRect(0,0,this.overlay.width, this.overlay.height);
    }
  }

  sendLatencyPing(){ /* handled by WS */ }

  resizeToParent(){
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = Math.max(420, parent.clientHeight);
    const scale = window.devicePixelRatio || 1;
    const cw = Math.floor(w * scale);
    const ch = Math.floor(h * scale);

    for (const c of [this.canvas, this.buffer, this.overlay]){
      c.width = cw; c.height = ch;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      const ctx = c.getContext('2d'); ctx.setTransform(scale,0,0,scale,0,0);
    }
    this._redrawBuffer();
  }

  clearLocal(){
    // For debugging only – clears local view (server still holds ops)
    this.bctx.clearRect(0,0,this.buffer.width, this.buffer.height);
    this.octx.clearRect(0,0,this.overlay.width, this.overlay.height);
    // redraw committed
    this._redrawBuffer();
  }
}
