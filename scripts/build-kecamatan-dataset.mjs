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
//   node scripts/build-kecamatan-dataset.mjs <path-to-hdx-file.geojson> [--force]
//     Filters to ADM3 (kecamatan) Polygon features (MultiPolygon kecamatan
//     are skipped — unsupported, see boundaryRegions.js), remaps their
//     properties to BIG's field names, simplifies each polygon ring, and
//     writes src/data/kecamatan-indonesia.json.
//
//     Safety check: if src/data/kecamatan-indonesia.json already exists
//     and holds far more features than this run would produce (e.g. the
//     bundled real national dataset vs. a small smoke-test fixture like
//     scripts/fixtures/sample-hdx-input.geojson), the script refuses to
//     overwrite it — pass --force to override.
//
// See docs/superpowers/specs/2026-09-09-rain-density-national-kecamatan-data-source-design.md

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simplifyRing } from '../src/lib/simplifyPolygon.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', 'kecamatan-indonesia.json');

// Confirmed against the real downloaded file (idn_admin3.geojson from
// HDX's cod-ab-idn dataset, `--inspect` run 2026-09-09): actual field names
// are lowercase, NOT the OCHA "ADM3_EN" style originally assumed here —
// e.g. `adm3_name`, `adm3_pcode`, `adm2_name`, `adm1_name`. Updated to
// match the real file (see Task 7, Step 2 in the implementation plan).
const FIELD_MAP = {
  namobj: 'adm3_name',
  wadmkc: 'adm3_name',
  wadmkk: 'adm2_name',
  wadmpr: 'adm1_name',
};
// A feature is an ADM3 (kecamatan) record if it has a non-empty value for
// this field — HDX COD-AB files commonly bundle every admin level (0-4)
// in one FeatureCollection, distinguished by which ADM*_PCODE/EN fields
// are populated. CONFIRM against the real file with --inspect.
const ADM3_LEVEL_FIELD = 'adm3_pcode';

// Degrees, not meters — same unit simplifyRing() expects. Chosen to land
// in the same visual ballpark as BIG's own maxAllowableOffset=0.001
// (~111m at the equator) that the earlier Kendari-only version verified
// empirically; re-check against the real output file's size in Task 7
// rather than trusting this in isolation.
const SIMPLIFY_TOLERANCE_DEG = 0.001;

// Only plain Polygon geometry is supported — MultiPolygon features (some
// real kecamatan with disjoint parts, e.g. small offshore islands) are
// filtered out entirely before reaching this function (see the `Polygon`
// type-check in main()'s adm3Features filter below), rather than attempting
// to normalize their multi-part shape.
function simplifyGeometry(geometry) {
  const ring = geometry?.coordinates?.[0];
  if (!ring) return geometry;
  const points = ring.map(([lng, lat]) => ({ lat, lng }));
  const simplified = simplifyRing(points, SIMPLIFY_TOLERANCE_DEG);
  return { type: 'Polygon', coordinates: [simplified.map((p) => [p.lng, p.lat])] };
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
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const inspectMode = args[0] === '--inspect';
  const inputPath = inspectMode ? args[1] : args[0];

  if (!inputPath) {
    console.error('Usage: node scripts/build-kecamatan-dataset.mjs [--inspect] <path-to-hdx-file.geojson> [--force]');
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

  const adm3Features = features.filter((f) =>
    Boolean(f.properties?.[ADM3_LEVEL_FIELD]) && f.geometry?.type === 'Polygon');
  const skippedMultiPolygon = features.filter((f) =>
    Boolean(f.properties?.[ADM3_LEVEL_FIELD]) && f.geometry?.type === 'MultiPolygon').length;
  console.log(`Found ${adm3Features.length} ADM3 (kecamatan) Polygon features out of ${features.length} total ` +
    `(skipped ${skippedMultiPolygon} MultiPolygon kecamatan — unsupported, see boundaryRegions.js).`);

  const output = {
    type: 'FeatureCollection',
    features: adm3Features.map(remapFeature),
  };

  if (!force && existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    const existingCount = existing.features?.length || 0;
    const newCount = output.features.length;
    if (existingCount > newCount * 10) {
      console.error(
        `Refusing to overwrite ${OUTPUT_PATH} (${existingCount} existing kecamatan) with only ` +
        `${newCount} new ones — this looks like a smoke-test run against a small fixture, not a ` +
        `real conversion. Pass --force to overwrite anyway.`
      );
      process.exit(1);
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`Wrote ${adm3Features.length} kecamatan to ${OUTPUT_PATH}`);
}

main();
