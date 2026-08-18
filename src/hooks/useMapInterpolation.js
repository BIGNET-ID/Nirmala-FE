import { useMemo } from 'react';

/**
 * Hook untuk melakukan interpolasi IDW (Inverse Distance Weighting)
 * pada data sensor untuk menghasilkan grid heatmap.
 */
export function useMapInterpolation(stations, activeLayer) {
  const gridData = useMemo(() => {
    if (!stations || stations.length === 0) return [];

    // Untuk sekarang kembalikan data mentah stations
    // Kalkulasi IDW yang berat akan dilakukan di Web Worker terpisah
    return stations.map((st) => ({
      id: st.id,
      lat: st.lat,
      lng: st.lng,
      value: activeLayer === 'rain' ? st.rain : st.temp,
    }));
  }, [stations, activeLayer]);

  return gridData;
}