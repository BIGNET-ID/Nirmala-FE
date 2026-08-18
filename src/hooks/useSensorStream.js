import { useEffect, useState, useRef } from 'react';

export function useSensorStream(initialStations) {
  const [stations, setStations] = useState(initialStations);
  const bufferRef = useRef({});
  const rafIdRef = useRef(null);

  useEffect(() => {
    // Inisialisasi Server-Sent Events (SSE) Stream
    const eventSource = new EventSource('/api/telemetry/stream');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data); // { stationId: 'S1', rain: 65, temp: 28.4 }
          
        // Simpan ke Ring Buffer, jangan langsung setStations()!
        bufferRef.current[payload.stationId] = payload;
      } catch (err) {
        console.error('Failed to parse SSE telemetry payload:', err);
      }
    };

    // Batching loop dengan RequestAnimationFrame & Throttling
    let lastFlushTime = performance.now();

    const flushBuffer = (now) => {
      // Flush buffer ke state React maksimal setiap 200 ms
      if (now - lastFlushTime > 200 && Object.keys(bufferRef.current).length > 0) {
        setStations((prev) =>
          prev.map((st) => {
            const update = bufferRef.current[st.id];
            return update ? { ...st, ...update } : st;
          })
        );
        bufferRef.current = {}; // Clear buffer
        lastFlushTime = now;
      }
      rafIdRef.current = requestAnimationFrame(flushBuffer);
    };

    rafIdRef.current = requestAnimationFrame(flushBuffer);

    return () => {
      eventSource.close();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return stations;
}
