import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothZoomTo } from './smoothZoom.js';

// Minimal fake of the google.maps.Map surface smoothZoomTo actually uses:
// getZoom/setZoom/addListener('idle', cb) -> {remove()}. setZoom synchronously
// fires any pending 'idle' listeners, simulating "tiles settled instantly" —
// enough to make the recursive step logic deterministic in a test.
function makeFakeMap(startZoom) {
  let zoom = startZoom;
  const listeners = [];
  return {
    getZoom: () => zoom,
    setZoom: (z) => {
      zoom = z;
      const toFire = listeners.slice();
      listeners.length = 0;
      toFire.forEach((cb) => cb());
    },
    addListener: (event, cb) => {
      if (event === 'idle') listeners.push(cb);
      return { remove: () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      } };
    },
  };
}

test('smoothZoomTo: already at target zoom calls onDone immediately, no setZoom', () => {
  const map = makeFakeMap(5);
  let done = false;
  let setZoomCalls = 0;
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { setZoomCalls++; origSetZoom(z); };
  smoothZoomTo(map, 5, () => { done = true; });
  assert.equal(done, true);
  assert.equal(setZoomCalls, 0);
});

test('smoothZoomTo: steps down one level at a time from 10 to 5', () => {
  const map = makeFakeMap(10);
  const zoomsSeen = [];
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { zoomsSeen.push(z); origSetZoom(z); };
  let done = false;
  smoothZoomTo(map, 5, () => { done = true; });
  assert.deepEqual(zoomsSeen, [9, 8, 7, 6, 5]);
  assert.equal(done, true);
});

test('smoothZoomTo: steps up one level at a time when target is higher', () => {
  const map = makeFakeMap(2);
  const zoomsSeen = [];
  const origSetZoom = map.setZoom;
  map.setZoom = (z) => { zoomsSeen.push(z); origSetZoom(z); };
  smoothZoomTo(map, 5, () => {});
  assert.deepEqual(zoomsSeen, [3, 4, 5]);
});

test('smoothZoomTo: calls onDone exactly once at the end', () => {
  const map = makeFakeMap(8);
  let calls = 0;
  smoothZoomTo(map, 5, () => { calls++; });
  assert.equal(calls, 1);
});

test('smoothZoomTo: works with no onDone callback provided', () => {
  const map = makeFakeMap(7);
  assert.doesNotThrow(() => smoothZoomTo(map, 5));
});
