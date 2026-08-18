/**
 * QuadTree untuk optimasi pencarian spatial.
 * Digunakan untuk mempercepat IDW interpolation lookup.
 */
export class QuadTree {
  constructor(bounds, capacity = 4) {
    this.bounds = bounds; // { x, y, w, h }
    this.capacity = capacity;
    this.points = [];
    this.divided = false;
  }

  insert(point) {
    if (!this._inBounds(point)) return false;
    if (this.points.length < this.capacity) {
      this.points.push(point);
      return true;
    }
    if (!this.divided) this._subdivide();
    return (
      this.ne.insert(point) || this.nw.insert(point) ||
      this.se.insert(point) || this.sw.insert(point)
    );
  }

  query(range, found = []) {
    if (!this._intersects(range)) return found;
    for (const p of this.points) {
      if (this._inRange(p, range)) found.push(p);
    }
    if (this.divided) {
      this.ne.query(range, found);
      this.nw.query(range, found);
      this.se.query(range, found);
      this.sw.query(range, found);
    }
    return found;
  }

  _subdivide() {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2; const hh = h / 2;
    this.ne = new QuadTree({ x: x + hw, y, w: hw, h: hh }, this.capacity);
    this.nw = new QuadTree({ x, y, w: hw, h: hh }, this.capacity);
    this.se = new QuadTree({ x: x + hw, y: y + hh, w: hw, h: hh }, this.capacity);
    this.sw = new QuadTree({ x, y: y + hh, w: hw, h: hh }, this.capacity);
    this.divided = true;
  }

  _inBounds(p) {
    const { x, y, w, h } = this.bounds;
    return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
  }

  _inRange(p, r) {
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  _intersects(range) {
    const b = this.bounds; const r = range;
    return !(r.x > b.x + b.w || r.x + r.w < b.x || r.y > b.y + b.h || r.y + r.h < b.y);
  }
}