import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegions } from './boundaryRegions.js';

const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { namobj: 'Wundumbatu', wadmkc: 'Poasia', wadmkk: 'Kota Kendari', wadmpr: 'Sulawesi Tenggara' },
      geometry: {
        type: 'Polygon',
        // GeoJSON coordinate order is [lng, lat] — a simple square around
        // roughly Kendari's real coordinates, not the true detailed shape.
        coordinates: [[
          [122.55, -3.99], [122.56, -3.99], [122.56, -3.98], [122.55, -3.98], [122.55, -3.99],
        ]],
      },
    },
  ],
};

test('normalizeRegions: flips GeoJSON [lng,lat] to {lat,lng}, keeps only needed fields', () => {
  const [region] = normalizeRegions(SAMPLE_GEOJSON);
  assert.equal(region.name, 'Wundumbatu');
  assert.equal(region.kecamatan, 'Poasia');
  assert.equal(region.kabupaten, 'Kota Kendari');
  assert.equal(region.provinsi, 'Sulawesi Tenggara');
  assert.equal(region.polygon.length, 5);
  assert.deepEqual(region.polygon[0], { lat: -3.99, lng: 122.55 });
});

test('normalizeRegions: centroid is the average of the polygon vertices', () => {
  const [region] = normalizeRegions(SAMPLE_GEOJSON);
  // Average of the 5 ring points above (first==last corner counted twice,
  // matching a plain arithmetic mean over the ring as returned by BIG).
  const expectedLat = (-3.99 + -3.99 + -3.98 + -3.98 + -3.99) / 5;
  const expectedLng = (122.55 + 122.56 + 122.56 + 122.55 + 122.55) / 5;
  assert.ok(Math.abs(region.centroid.lat - expectedLat) < 1e-9);
  assert.ok(Math.abs(region.centroid.lng - expectedLng) < 1e-9);
});

test('normalizeRegions: empty/missing features returns an empty array', () => {
  assert.deepEqual(normalizeRegions({ type: 'FeatureCollection', features: [] }), []);
  assert.deepEqual(normalizeRegions({}), []);
});
