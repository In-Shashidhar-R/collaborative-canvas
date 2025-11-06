# 🏗️ Architecture

## Data Flow Diagram (High Level)

User Input → Client Stroke Stream (`begin/point/end`) → WebSocket → Server (order, commit) → Broadcast
→ Other Clients (render incremental) → Canvas

```
[Pointer events]
    ↓
[Client StrokeBuffer + Smoother]
    ↓ stream (ws)
[Server] --timestamps--> [OpLog (stack)] --broadcast-->
    ↓                                         ↓
[Global undo/redo]                        [Clients draw]
```

## WebSocket Protocol

**Client → Server**
- `cursor` `{ x, y, tool, color }`
- `stroke:begin` `{ tempId, tool, color, size, start: [x,y], t }`
- `stroke:point` `{ tempId, p: [x,y], t }`
- `stroke:end`   `{ tempId }`
- `undo` `{}`
- `redo` `{}`

**Server → Client**
- `init` `{ self, users, ops }`  // full committed ops on join
- `user:join` `{ user }`
- `user:leave` `{ userId }`
- `cursor` `{ userId, x, y, tool, color }`
- `stroke:begin` `{ userId, tempId, meta }`
- `stroke:point` `{ userId, tempId, p, t }`
- `stroke:commit` `{ userId, id, tempId, op }` // op has full points
- `revoke` `{ id }`  // for global undo
- `reapply` `{ op }` // for global redo (sends full op again)

## Undo/Redo Strategy (Global)

- Server keeps `ops` stack (committed) and `undone` stack.
- `undo`: pop from `ops` → push to `undone` → broadcast `revoke(id)`
- `redo`: pop from `undone` → push to `ops` → broadcast `reapply(op)`
- Affects the global draw order regardless of who created the stroke.

## Conflict Resolution

- Server assigns commit order by arrival time (monotonic counter).
- Overlaps resolve visually by order. Eraser uses `globalCompositeOperation = 'destination-out'`.
- While streaming, clients render incrementally; commit replaces temp stroke with committed id.

## Performance Decisions

- **Incremental draw**: draw incoming points directly; no full-canvas rerender per frame.
- **Offscreen buffer**: committed ops rasterized onto a base buffer; active strokes drawn on top.
- **Path smoothing**: quadratic Bézier between sampled points.
- **Throttled events**: pointermove events batched (~8ms).

