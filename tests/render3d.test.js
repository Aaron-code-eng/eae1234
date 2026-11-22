import test from 'node:test';
import assert from 'node:assert/strict';

import { clipNear, Camera3D, cross, dot, vec } from '../src/render/Math3D.js';
import { Renderer3D } from '../src/render/Renderer3D.js';
import { AdminSystem } from '../src/systems/AdminSystem.js';

test('3D basis vectors are orthonormal and right-handed', () => {
  const camera = new Camera3D();
  camera.yaw = 0;
  camera.pitch = 0;
  camera.updateBasis();
  assert.ok(Math.abs(dot(camera.forward, camera.right)) < 1e-9);
  assert.ok(Math.abs(dot(camera.forward, camera.up)) < 1e-9);
  for (const [actual, expected] of [[camera.forward, vec(1, 0, 0)], [camera.right, vec(0, 0, 1)], [camera.up, vec(0, 1, 0)]]) {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
    assert.ok(Math.abs(actual.z - expected.z) < 1e-9);
  }
});

test('perspective projection maps a centered point to screen center', () => {
  const camera = new Camera3D();
  camera.position = vec(0, 0, 0);
  camera.yaw = 0;
  camera.pitch = 0;
  camera.setViewport(1000, 800);
  camera.updateBasis();
  const point = camera.project(camera.toCamera(vec(100, 0, 0)));
  assert.equal(Math.round(point.x), 500);
  assert.equal(Math.round(point.y), 400);
  assert.equal(camera.project(camera.toCamera(vec(-100, 0, 0))), null);
});

test('near-plane clipping keeps a polygon inside the view volume', () => {
  const polygon = [vec(-10, -10, -5), vec(10, -10, 5), vec(10, 10, 5), vec(-10, 10, -5)];
  const clipped = clipNear(polygon, 2);
  assert.ok(clipped.length >= 4);
  for (const point of clipped) assert.ok(point.z >= 2 - 1e-9);
});

test('camera modes validate input without needing a canvas', () => {
  const state = Object.create(Renderer3D.prototype);
  state.cameraMode = 'chase';
  assert.equal(Renderer3D.prototype.setCamera.call(state, 'hood'), true);
  assert.equal(state.cameraMode, 'hood');
  assert.equal(Renderer3D.prototype.setCamera.call(state, 'nope'), false);
  assert.equal(state.cameraMode, 'hood');
  assert.equal(Renderer3D.prototype.cycleCamera.call(state), true);
});

test('admin /cam switches the 3D camera', () => {
  const admin = new AdminSystem();
  const calls = [];
  const ctx = { game: { renderer: { setCamera: (mode) => { calls.push(mode); return mode !== 'bad'; } } } };
  assert.equal(admin.execute('/cam hood', ctx).ok, true);
  assert.equal(admin.execute('/cam top', ctx).ok, true);
  assert.equal(admin.execute('/cam bad', ctx).ok, false);
  assert.deepEqual(calls, ['hood', 'top', 'bad']);
});
