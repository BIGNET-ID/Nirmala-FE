#!/usr/bin/env node
// scripts/build-kecamatan-dataset.mjs
//
// One-time, developer-run data-prep tool — NOT part of `npm run build` or
// `npm run deploy`. Converts a downloaded HDX "Indonesia - Subnational
// Administrative Boundaries" (cod-ab-idn) GeoJSON export into the compact,
// pre-simplified, BIG-field-shaped static file this app bundles at
// src/data/kecamatan-indonesia.json.
//
// Usage:
//   node scripts/build-kecamatan-dataset.mjs --inspect <path-to-hdx-file.geojson>
//     Prints the property keys of the first feature, so you can confirm
//     (or correct) FIELD_MAP/ADM3_LEVEL_FIELD below before converting.
//
//   node scripts/build-kecamatan-dataset.mjs <path-to-hdx-file.geojson>
//     Filters to ADM3 (kecamatan) features, remaps their properties to
//     BIG's field names, simplifies each polygon ring, and writes
//     src/data/kecamatan-indonesia.json.
//
// See docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simplifyRing } from '../src/lib/simplifyPolygon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', 'kecamatan-indonesia.json');

// Standard OCHA/HDX COD-AB field-naming convention — CONFIRM against the
// real downloaded file with --inspect before trusting this for a real run
// (see Task 7, Step 1 in the implementation plan).
const FIELD_MAP = {
  namobj: 'ADM3_EN',
  wadmkc: 'ADM3_EN',
  wadmkk: 'ADM2_EN',
  wadmpr: 'ADM1_EN',
};
// A feature is an ADM3 (kecamatan) record if it has a non-empty value for
// this field — HDX COD-AB files commonly bundle every admin level (0-4)
// in one FeatureCollection, distinguished by which ADM*_PCODE/EN fields
// are populated. CONFIRM against the real file with --inspect.
const ADM3_LEVEL_FIELD = 'ADM3_PCODE';

// Degrees, not meters — same unit simplifyRing() expects. Chosen to land
// in the same visual ballpark as BIG's own maxAllowableOffset=0.001
// (~111m at the equator) that the earlier Kendari-only version verified
// empirically; re-check against the real output file's size in Task 7
// rather than trusting this in isolation.
const SIMPLIFY_TOLERANCE_DEG = 0.001;

function exteriorRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon[0]);
  }
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates[0]];
  }
  return [];
}

function simplifyGeometry(geometry) {
  const rings = exteriorRings(geometry);
  if (rings.length === 0) return geometry;
  const simplifiedRings = rings.map((ring) => {
    const points = ring.map(([lng, lat]) => ({ lat, lng }));
    const simplified = simplifyRing(points, SIMPLIFY_TOLERANCE_DEG);
    return simplified.map((p) => [p.lng, p.lat]);
  });
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: simplifiedRings.map((ring) => [ring]) };
  }
  return { type: 'Polygon', coordinates: [simplifiedRings[0]] };
}

function remapFeature(feature) {
  const props = feature.properties || {};
  return {
    type: 'Feature',
    properties: {
      namobj: props[FIELD_MAP.namobj] || null,
      wadmkc: props[FIELD_MAP.wadmkc] || null,
      wadmkk: props[FIELD_MAP.wadmkk] || null,
      wadmpr: props[FIELD_MAP.wadmpr] || null,
    },
    geometry: simplifyGeometry(feature.geometry),
  };
}

function main() {
  const args = process.argv.slice(2);
  const inspectMode = args[0] === '--inspect';
  const inputPath = inspectMode ? args[1] : args[0];

  if (!inputPath) {
    console.error('Usage: node scripts/build-kecamatan-dataset.mjs [--inspect] <path-to-hdx-file.geojson>');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  const features = raw.features || [];

  if (inspectMode) {
    const sample = features[0];
    console.log('First feature property keys:', sample ? Object.keys(sample.properties || {}) : '(no features found)');
    console.log('Total feature count:', features.length);
    return;
  }

  const adm3Features = features.filter((f) => Boolean(f.properties?.[ADM3_LEVEL_FIELD]));
  console.log(`Found ${adm3Features.length} ADM3 (kecamatan) features out of ${features.length} total.`);

  const output = {
    type: 'FeatureCollection',
    features: adm3Features.map(remapFeature),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`Wrote ${adm3Features.length} kecamatan to ${OUTPUT_PATH}`);
}

main();
