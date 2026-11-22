/**
 * Minimal 3D math for the software renderer.
 *
 * World axes: x/z are the game's ground plane (z was the old y), y is height.
 * A car heading of 0 points along +x, which matches the 2D physics.
 */

export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => vec(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a, b) => vec(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);

export function normalize(a) {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

/** Sutherland-Hodgman clip of a camera-space polygon against the near plane. */
export function clipNear(polygon, near) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const aInside = a.z >= near;
    const bInside = b.z >= near;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const t = (near - a.z) / (b.z - a.z);
      result.push(vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, near));
    }
  }
  return result;
}

export class Camera3D {
  constructor() {
    this.position = vec(0, 50, -100);
    this.yaw = 0;
    this.pitch = 0.35;
    this.fov = (70 * Math.PI) / 180;
    this.near = 2;
    this.focal = 1;
    this.width = 1;
    this.height = 1;
    this.updateBasis();
  }

  setViewport(width, height) {
    this.width = width;
    this.height = height;
    this.focal = (height / 2) / Math.tan(this.fov / 2);
  }

  updateBasis() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this.forward = vec(cp * Math.cos(this.yaw), -sp, cp * Math.sin(this.yaw));
    this.right = normalize(cross(this.forward, vec(0, 1, 0)));
    this.up = cross(this.right, this.forward);
  }

  toCamera(point) {
    const d = sub(point, this.position);
    return vec(dot(d, this.right), dot(d, this.up), dot(d, this.forward));
  }

  project(cameraPoint) {
    if (cameraPoint.z <= this.near) return null;
    const s = this.focal / cameraPoint.z;
    return { x: this.width / 2 + cameraPoint.x * s, y: this.height / 2 - cameraPoint.y * s };
  }
}
