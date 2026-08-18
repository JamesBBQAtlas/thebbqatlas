/**
 * US state bounding boxes for the Places geographic sweep (patch 0071). A single
 * national `searchText` only returns Google's top ~20–60, so a 76-store chain comes back
 * a third complete. Sweeping per-state with a `locationRestriction.rectangle` surfaces
 * each state's branches. Boxes are approximate (a few tenths of a degree of slack is
 * fine — a restriction only needs to contain the state's venues), lng is negative (west).
 *
 * These feed a GAP-FILL: the orchestrator sweeps only states OSM didn't already cover, so
 * a working Overpass (Part A) keeps Places cheap.
 */
import type { PlacesRegion } from "./places";

/** [key, southLat, westLng, northLat, eastLng] — approximate state envelopes. */
const US_STATE_BOXES: [string, number, number, number, number][] = [
  ["AL", 30.1, -88.5, 35.1, -84.9], ["AZ", 31.3, -114.9, 37.1, -109.0],
  ["AR", 33.0, -94.7, 36.6, -89.6], ["CA", 32.5, -124.5, 42.1, -114.1],
  ["CO", 36.9, -109.1, 41.1, -102.0], ["CT", 40.9, -73.8, 42.1, -71.7],
  ["DE", 38.4, -75.8, 39.9, -75.0], ["DC", 38.8, -77.2, 39.0, -76.9],
  ["FL", 24.4, -87.7, 31.1, -79.9], ["GA", 30.3, -85.7, 35.1, -80.8],
  ["ID", 41.9, -117.3, 49.1, -111.0], ["IL", 36.9, -91.6, 42.6, -87.4],
  ["IN", 37.7, -88.2, 41.8, -84.7], ["IA", 40.3, -96.7, 43.6, -90.1],
  ["KS", 36.9, -102.1, 40.1, -94.5], ["KY", 36.4, -89.7, 39.2, -81.9],
  ["LA", 28.9, -94.1, 33.1, -88.7], ["ME", 42.9, -71.2, 47.6, -66.9],
  ["MD", 37.8, -79.5, 39.8, -74.9], ["MA", 41.2, -73.6, 42.9, -69.8],
  ["MI", 41.6, -90.5, 48.4, -82.3], ["MN", 43.4, -97.3, 49.5, -89.4],
  ["MS", 30.1, -91.7, 35.1, -88.0], ["MO", 35.9, -95.9, 40.7, -89.0],
  ["MT", 44.3, -116.1, 49.1, -104.0], ["NE", 39.9, -104.1, 43.1, -95.2],
  ["NV", 35.0, -120.1, 42.1, -114.0], ["NH", 42.6, -72.6, 45.4, -70.6],
  ["NJ", 38.8, -75.6, 41.4, -73.8], ["NM", 31.2, -109.1, 37.1, -102.9],
  ["NY", 40.4, -79.8, 45.1, -71.8], ["NC", 33.7, -84.4, 36.7, -75.4],
  ["ND", 45.9, -104.1, 49.1, -96.5], ["OH", 38.3, -84.9, 42.4, -80.5],
  ["OK", 33.6, -103.1, 37.1, -94.4], ["OR", 41.9, -124.7, 46.3, -116.4],
  ["PA", 39.7, -80.6, 42.4, -74.6], ["RI", 41.1, -71.9, 42.1, -71.1],
  ["SC", 32.0, -83.4, 35.3, -78.4], ["SD", 42.4, -104.1, 46.0, -96.4],
  ["TN", 34.9, -90.4, 36.7, -81.6], ["TX", 25.8, -106.7, 36.6, -93.5],
  ["UT", 36.9, -114.1, 42.1, -109.0], ["VT", 42.7, -73.5, 45.1, -71.5],
  ["VA", 36.5, -83.7, 39.5, -75.2], ["WA", 45.5, -124.8, 49.1, -116.9],
  ["WV", 37.1, -82.7, 40.7, -77.7], ["WI", 42.4, -92.9, 47.1, -86.8],
  ["WY", 40.9, -111.1, 45.1, -104.0],
  // AK box covers the mainland/panhandle (the far Aleutians cross the antimeridian and
  // carry no chain outlets, so they're outside this rectangle by design).
  ["AK", 51.2, -179.1, 71.4, -129.9], ["HI", 18.9, -160.3, 22.3, -154.8],
];

/** All 50 states + DC as Places sweep regions. */
export function usStateRegions(): PlacesRegion[] {
  return US_STATE_BOXES.map(([key, s, w, n, e]) => ({
    key,
    locationRestriction: { rectangle: { low: { latitude: s, longitude: w }, high: { latitude: n, longitude: e } } },
  }));
}

/** Two-letter state codes (for matching OSM coverage against the sweep regions). */
export const US_STATE_CODES = US_STATE_BOXES.map(([key]) => key);
