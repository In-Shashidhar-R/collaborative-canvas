export class WS {
  constructor(handlers){
    this.handlers = handlers;
    this.socket = io({ transports: ['websocket'] });
    this._setup();
  }

  _setup(){
    const s = this.socket;
    const H = this.handlers;

    s.on('connect', () => {
      this._latencyInterval = setInterval(() => {
        const t0 = performance.now();
        s.timeout(3000).emit('ping', {}, () => {
          const ms = performance.now() - t0;
          H.onLatency?.(Math.round(ms));
        });
      }, 2000);
    });

    s.on('disconnect', () => {
      if (this._latencyInterval) clearInterval(this._latencyInterval);
    });

    s.on('init', (msg)=> H.onInit?.(msg));
    s.on('user:join', (msg)=> H.onUserJoin?.(msg));
    s.on('user:leave', (msg)=> H.onUserLeave?.(msg));
    s.on('cursor', (msg)=> H.onCursor?.(msg));
    s.on('stroke:begin', (msg)=> H.onStrokeBegin?.(msg));
    s.on('stroke:point', (msg)=> H.onStrokePoint?.(msg));
    s.on('stroke:commit', (msg)=> H.onStrokeCommit?.(msg));
    s.on('revoke', (msg)=> H.onRevoke?.(msg));
    s.on('reapply', (msg)=> H.onReapply?.(msg));
  }

  sendCursor(pos){ this.socket.emit('cursor', pos); }

  sendStrokeEvent(evt){
    this.socket.emit(evt.type, evt);
  }

  emit(type, payload){ this.socket.emit(type, payload); }
}
