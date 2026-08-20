// Shared status vocabulary for "Layer Tambahan" toggles (and any future layer).
// Lets MetricLayerSelector show one consistent little indicator per toggle
// instead of every layer inventing its own "empty vs broken" signal.
export const LAYER_STATUS = {
  IDLE: 'idle',       // not yet fetched / stream not connected yet
  LOADING: 'loading', // first fetch/connect in flight
  OK: 'ok',           // has data, rendering normally
  EMPTY: 'empty',     // fetched/connected fine, but there's nothing to show right now
  ERROR: 'error',     // fetch failed / stream dropped and isn't recovering
};
