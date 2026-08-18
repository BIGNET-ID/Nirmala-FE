# **Nirmala Platform \- FE Technical Blueprint & Architecture Guide**

Dokumen ini dirancang sebagai panduan arsitektur front-end standar industri untuk membangun platform pemantauan geospasial **Nirmala** berbasis Next.js, Material UI (MUI), Google Maps API, Engine Interpolasi Heatmap ala Ventusky, dan Simulasi Vektor Angin.

## **1\. Executive FE Architecture & Key Challenges**

Membangun aplikasi *Ventusky-like radar* membutuhkan perhatian khusus pada 3 pilar utama:

1. **Geospatial Rendering Performance (60 FPS)**:  
   * Interpolasi nilai dari titik sensor terisolasi menjadi *continuous spatial heatmap* membutuhkan kalkulasi ribuan piksel per *frame*.  
   * **Solusi Industri**: Jalankan komputasi matematika IDW (Inverse Distance Weighting) di **Web Worker** agar tidak memblokir *Main Thread* React, atau manfaatkan **WebGL Shader** (Fragment Shader) langsung di atas Canvas Google Maps Overlay.  
2. **Real-time IoT Telemetry Stream**:  
   * Sensor suhu dan curah hujan mengirimkan titik data secara berkala.  
   * **Solusi**: Integrasi WebSocket / Server-Sent Events (SSE) dengan buffer state terpusat untuk *smooth interpolation update*.  
3. **Secure Local Persistence in Next.js SSR**:  
   * Menyimpan *auth session* terenkripsi dengan crypto-js di localStorage tanpa memicu bug *Hydration Mismatch* pada Next.js App Router.

## **2\. Next.js App Router \- Enterprise Folder Structure**

Berikut adalah struktur direktori modular yang memisahkan *UI Components*, *Geospatial Engine*, *Web Workers*, dan *Secure Auth Layer*:

nirmala/  
├── src/  
│   ├── app/  
│   │   ├── (auth)/  
│   │   │   ├── login/  
│   │   │   │   └── page.jsx  
│   │   │   └── layout.jsx  
│   │   ├── (dashboard)/  
│   │   │   ├── page.jsx               \# Main Interactive Ventusky Dashboard  
│   │   │   ├── sensors/  
│   │   │   │   └── page.jsx           \# Sensor Station Management  
│   │   │   └── layout.jsx  
│   │   ├── api/                       \# Next.js Route Handlers / API Proxy  
│   │   ├── layout.jsx                 \# Root Layout  
│   │   └── providers.jsx              \# MUI Theme, Query Client, Auth Provider  
│   ├── components/  
│   │   ├── common/                    \# Reusable UI Wrappers  
│   │   │   ├── AppIcon.jsx            \# Iconify Dynamic Wrapper  
│   │   │   ├── GlassCard.jsx          \# Glassmorphism Container  
│   │   │   └── LoadingOverlay.jsx  
│   │   ├── auth/  
│   │   │   └── AuthGuard.jsx  
│   │   ├── map/                       \# Geospatial & Map Core  
│   │   │   ├── GoogleMapWrapper.jsx   \# Google Maps JS API Loader  
│   │   │   ├── CanvasOverlay.jsx      \# Google Maps OverlayView \+ Canvas IDW Bridge  
│   │   │   ├── WindFlowLayer.jsx      \# Vector Animated Wind Particle System  
│   │   │   ├── SensorMarker.jsx       \# Interactive Pulsing Station Markers  
│   │   │   └── MapControls.jsx        \# Zoom, Pan, Tilt & Map Type Selector  
│   │   └── dashboard/                 \# Dashboard Controls  
│   │       ├── HeaderNavbar.jsx  
│   │       ├── MetricLayerSelector.jsx\# Layer Hujan, Suhu, Kelembapan, Angin  
│   │       ├── TimelinePlayer.jsx     \# Timeline Controller 24 Jam  
│   │       ├── ColorRampLegend.jsx    \# Dynamic Legend Scale Bar  
│   │       └── SensorDetailDrawer.jsx \# Detail Telemetri Sensor  
│   ├── context/  
│   │   └── AuthContext.jsx            \# Context Auth dengan Encrypted Storage  
│   ├── hooks/  
│   │   ├── useAuth.js  
│   │   ├── useSensorStream.js         \# WebSocket / SSE Live Data Stream Hook  
│   │   └── useMapInterpolation.js     \# Web Worker Canvas IDW Bridge  
│   ├── workers/  
│   │   └── idwWorker.worker.js        \# Web Worker Thread untuk Kalkulasi IDW Heatmap  
│   ├── lib/  
│   │   ├── crypto.js                  \# AES Utility crypto-js  
│   │   ├── theme.js                   \# MUI Dark Futuristic Glass Theme  
│   │   ├── axios.js                   \# Network Client  
│   │   └── algorithms/  
│   │       ├── colorScales.js         \# Color Palette Interpolators  
│   │       ├── quadTree.js            \# Spatial Indexing Clustering  
│   │       └── vectorInterpolation.js \# Bilinear Interpolation Vector Angin  
│   ├── types/                         \# JSDoc / Type Declarations  
│   └── constants/  
│       ├── mapConfig.js               \# Bounds, Default Lat/Lng Indonesia  
│       └── metrics.js                 \# Skala ambang batas Hujan (mm/jam) & Suhu (°C)  
├── public/  
│   └── assets/  
└── package.json

## **3\. Keamanan Storage dengan crypto-js (Safe SSR Hydration)**

Di Next.js, mengakses localStorage saat *server-side rendering* akan menyebabkan error. Kita buat *safe wrapper* yang mendukung enkripsi AES dan aman dari *hydration mismatch*.

### **src/lib/crypto.js**

import CryptoJS from 'crypto-js';

const SECRET\_KEY \= process.env.NEXT\_PUBLIC\_CRYPTO\_SECRET || 'nirmala-secure-key-2026';

export const secureStorage \= {  
  setItem: (key, data) \=\> {  
    if (typeof window \=== 'undefined') return;  
    try {  
      const jsonString \= JSON.stringify(data);  
      const encrypted \= CryptoJS.AES.encrypt(jsonString, SECRET\_KEY).toString();  
      localStorage.setItem(key, encrypted);  
    } catch (error) {  
      console.error('Error encrypting local data:', error);  
    }  
  },

  getItem: (key) \=\> {  
    if (typeof window \=== 'undefined') return null;  
    try {  
      const encrypted \= localStorage.getItem(key);  
      if (\!encrypted) return null;  
      const bytes \= CryptoJS.AES.decrypt(encrypted, SECRET\_KEY);  
      const decryptedString \= bytes.toString(CryptoJS.enc.Utf8);  
      if (\!decryptedString) return null;  
      return JSON.parse(decryptedString);  
    } catch (error) {  
      console.error('Error decrypting local data:', error);  
      return null;  
    }  
  },

  removeItem: (key) \=\> {  
    if (typeof window \=== 'undefined') return;  
    localStorage.removeItem(key);  
  }  
};

## **4\. Matematika Interpolasi Ventusky (IDW Engine)**

Ventusky tidak memakai *blur-circle heatmap* sederhana. Mereka memakai **Spatial Field Interpolation** berbasis *Inverse Distance Weighting* (IDW).

### **Formulasi Matematika IDW**

Untuk menghitung nilai metrik ![][image1] (misalnya curah hujan ![][image2] dalam ![][image3] atau suhu ![][image4] dalam ![][image5]) pada koordinat piksel ![][image6] di layar berdasarkan stasiun sensor ![][image7]:

* ![][image8]![][image9]![][image10]Keterangan: ![][image11] adalah power parameter (standar ![][image12]). Jika piksel berada tepat di lokasi sensor (![][image13]), nilai ![][image14].

## **5\. Integrasi Google Maps API OverlayView**

Google Maps JS API menyediakan kelas google.maps.OverlayView untuk menempelkan elemen DOM kustom (seperti HTML5 Canvas) tepat di atas koordinat geografis peta.

### **Mekanisme Lifecycle OverlayView**

1. **onAdd()**: Canvas diinisialisasi dan disisipkan ke *overlay pane* Google Maps (this.getPanes().overlayLayer).  
2. **draw()**: Dipanggil saat peta di-pan, di-zoom, atau di-resize. Di method ini, kita mengambil proyeksi geografis this.getProjection() untuk mengonversi koordinat ![][image15] sensor ke koordinat piksel Canvas ![][image6].  
3. **onRemove()**: Canvas dilepas dari DOM dan *event listeners* dibersihkan.

// Konversi Lat/Lng Stasiun ke Piksel Canvas di dalam Custom Overlay  
const projection \= overlay.getProjection();  
const pixelPos \= projection.fromLatLngToDivPixel(  
  new google.maps.LatLng(station.lat, station.lng)  
);

## **6\. Web Worker Architecture & Offscreen Canvas (Zero UI Lag)**

Menghitung IDW pada resolusi layar ![][image16] piksel berarti mengeksekusi ![][image17] kalkulasi per *frame*. Jika dilakukan di Main Thread React, aplikasi akan mengalami *freeze* (0 FPS).

### **Skema Arsitektur Multi-Thread:**

\+------------------------------------+          \+--------------------------------------+  
|        MAIN THREAD (React UI)      |          |         WEB WORKER THREAD            |  
|                                    |          |                                      |  
| 1\. Google Maps Drag/Zoom Event     |          |                                      |  
| 2\. Ambil Lat/Lng Sensor & Bounds   |          |                                      |  
| 3\. Konversi ke Canvas Pixel Pos    |          |                                      |  
| 4\. Kirim Data via postMessage()    | \--------\>| 1\. Terima Pixel Station & Window Dim |  
|                                    |          | 2\. Eksekusi Loop IDW Matrix (Piksel) |  
|                                    |          | 3\. Buat Uint8ClampedArray (RGBA)     |  
| 5\. Render dengan putImageData()    | \<--------| 4\. Kirim ImageData (Transferable)    |  
\+------------------------------------+          \+--------------------------------------+

### **Script Web Worker: src/workers/idwWorker.worker.js**

/\*\*  
 \* Web Worker untuk Kalkulasi IDW Heatmap Tanpa Mengganggu Main Thread UI  
 \*/  
self.onmessage \= function (e) {  
  const { width, height, stations, activeLayer, power \= 2, step \= 4 } \= e.data;

  const totalBytes \= width \* height \* 4;  
  const buffer \= new ArrayBuffer(totalBytes);  
  const pixelData \= new Uint8ClampedArray(buffer);

  const numStations \= stations.length;

  for (let y \= 0; y \< height; y \+= step) {  
    for (let x \= 0; x \< width; x \+= step) {  
      let weightSum \= 0;  
      let valueSum \= 0;  
      let exactMatch \= false;  
      let exactValue \= 0;

      for (let i \= 0; i \< numStations; i++) {  
        const st \= stations\[i\];  
        const dx \= x \- st.px;  
        const dy \= y \- st.py;  
        const distSq \= dx \* dx \+ dy \* dy;

        if (distSq \< 1.0) {  
          exactMatch \= true;  
          exactValue \= st.val;  
          break;  
        }

        const w \= 1 / Math.pow(distSq, power / 2);  
        weightSum \+= w;  
        valueSum \+= w \* st.val;  
      }

      const val \= exactMatch ? exactValue : valueSum / weightSum;

      // Map Nilai ke Warna RGBA  
      const \[r, g, b, a\] \= getColorForValue(val, activeLayer);

      // Fill Sub-grid (step x step)  
      for (let sy \= 0; sy \< step && y \+ sy \< height; sy++) {  
        for (let sx \= 0; sx \< step && x \+ sx \< width; sx++) {  
          const index \= ((y \+ sy) \* width \+ (x \+ sx)) \* 4;  
          pixelData\[index\] \= r;  
          pixelData\[index \+ 1\] \= g;  
          pixelData\[index \+ 2\] \= b;  
          pixelData\[index \+ 3\] \= a;  
        }  
      }  
    }  
  }

  // Transferable Objects (Zero Memory Copy)  
  self.postMessage({ buffer, width, height }, \[buffer\]);  
};

function getColorForValue(val, layer) {  
  if (layer \=== 'rain') {  
    if (val \< 5\) return \[0, 0, 0, 0\];  
    if (val \< 25\) return \[0, 229, 255, 120\];  // Cyan  
    if (val \< 50\) return \[0, 230, 118, 160\];  // Hijau  
    if (val \< 75\) return \[255, 235, 59, 190\]; // Kuning  
    if (val \< 100\) return \[255, 152, 0, 210\]; // Oranye  
    return \[244, 67, 54, 235\];                // Merah  
  } else {  
    const norm \= Math.max(0, Math.min(1, (val \- 20\) / 16));  
    const hue \= (1 \- norm) \* 240;  
    return hslToRgba(hue, 0.85, 0.5, 0.55);  
  }  
}

function hslToRgba(h, s, l, a) {  
  let c \= (1 \- Math.abs(2 \* l \- 1)) \* s;  
  let x \= c \* (1 \- Math.abs(((h / 60\) % 2\) \- 1));  
  let m \= l \- c / 2;  
  let r \= 0, g \= 0, b \= 0;

  if (0 \<= h && h \< 60\) { r \= c; g \= x; b \= 0; }  
  else if (60 \<= h && h \< 120\) { r \= x; g \= c; b \= 0; }  
  else if (120 \<= h && h \< 180\) { r \= 0; g \= c; b \= x; }  
  else if (180 \<= h && h \< 240\) { r \= 0; g \= x; b \= c; }  
  else if (240 \<= h && h \< 300\) { r \= x; g \= 0; b \= c; }  
  else if (300 \<= h && h \< 360\) { r \= c; g \= 0; b \= x; }

  return \[  
    Math.round((r \+ m) \* 255),  
    Math.round((g \+ m) \* 255),  
    Math.round((b \+ m) \* 255),  
    Math.round(a \* 255\)  
  \];  
}

## **7\. Custom Google Maps Canvas Overlay Class Component**

### **src/components/map/CanvasOverlay.jsx**

'use client';

import React, { useEffect, useRef } from 'react';

export default function CanvasOverlay({ map, stations, activeLayer, timeStep }) {  
  const canvasRef \= useRef(null);  
  const workerRef \= useRef(null);

  useEffect(() \=\> {  
    if (\!map || \!window.google) return;

    workerRef.current \= new Worker(  
      new URL('../../workers/idwWorker.worker.js', import.meta.url)  
    );

    const canvas \= document.createElement('canvas');  
    canvas.style.position \= 'absolute';  
    canvas.style.top \= '0';  
    canvas.style.left \= '0';  
    canvas.style.pointerEvents \= 'none';  
    canvas.style.mixBlendMode \= 'screen';  
    canvasRef.current \= canvas;

    class VentuskyOverlay extends window.google.maps.OverlayView {  
      onAdd() {  
        const panes \= this.getPanes();  
        panes.overlayLayer.appendChild(canvas);  
      }

      draw() {  
        const projection \= this.getProjection();  
        if (\!projection) return;

        const bounds \= map.getBounds();  
        if (\!bounds) return;

        const sw \= projection.fromLatLngToDivPixel(bounds.getSouthWest());  
        const ne \= projection.fromLatLngToDivPixel(bounds.getNorthEast());

        const width \= Math.ceil(Math.abs(ne.x \- sw.x));  
        const height \= Math.ceil(Math.abs(sw.y \- ne.y));

        canvas.width \= width;  
        canvas.height \= height;  
        canvas.style.width \= \`${width}px\`;  
        canvas.style.height \= \`${height}px\`;  
        canvas.style.left \= \`${sw.x}px\`;  
        canvas.style.top \= \`${ne.y}px\`;

        const pxStations \= stations.map((st) \=\> {  
          const pt \= projection.fromLatLngToDivPixel(  
            new window.google.maps.LatLng(st.lat, st.lng)  
          );  
          const timeFactor \= Math.sin((timeStep \+ st.rain) \* 0.2) \* 10;  
          const val \= activeLayer \=== 'rain'  
            ? Math.max(0, st.rain \+ timeFactor)  
            : Math.max(15, st.temp \+ timeFactor \* 0.1);

          return {  
            px: pt.x \- sw.x,  
            py: pt.y \- ne.y,  
            val: val,  
          };  
        });

        workerRef.current.postMessage({  
          width,  
          height,  
          stations: pxStations,  
          activeLayer,  
          power: 2,  
          step: 4,  
        });  
      }

      onRemove() {  
        if (canvas.parentNode) {  
          canvas.parentNode.removeChild(canvas);  
        }  
      }  
    }

    const overlay \= new VentuskyOverlay();  
    overlay.setMap(map);

    workerRef.current.onmessage \= (e) \=\> {  
      const { buffer, width, height } \= e.data;  
      const ctx \= canvas.getContext('2d');  
      if (\!ctx) return;

      const imgData \= new ImageData(new Uint8ClampedArray(buffer), width, height);  
      ctx.putImageData(imgData, 0, 0);  
    };

    return () \=\> {  
      overlay.setMap(null);  
      if (workerRef.current) workerRef.current.terminate();  
    };  
  }, \[map, stations, activeLayer, timeStep\]);

  return null;  
}

## **8\. Full Prototype Component Dashboard (Next.js \+ MUI \+ Iconify \+ Ventusky Engine)**

'use client';

import React, { useState, useEffect } from 'react';  
import {  
  ThemeProvider,  
  createTheme,  
  CssBaseline,  
  Box,  
  Paper,  
  Typography,  
  IconButton,  
  Button,  
  Slider,  
  Switch,  
  FormControlLabel,  
  Chip,  
  Divider,  
  Avatar,  
} from '@mui/material';  
import { Icon } from '@iconify/react';

const nirmalaTheme \= createTheme({  
  palette: {  
    mode: 'dark',  
    primary: { main: '\#00e5ff' },  
    secondary: { main: '\#ff4081' },  
    background: { default: '\#050811', paper: 'rgba(15, 23, 42, 0.82)' },  
    text: { primary: '\#f8fafc', secondary: '\#94a3b8' },  
  },  
  typography: {  
    fontFamily: '"Inter", system-ui, \-apple-system, sans-serif',  
  },  
  components: {  
    MuiPaper: {  
      styleOverrides: {  
        root: {  
          backdropFilter: 'blur(16px)',  
          border: '1px solid rgba(255, 255, 255, 0.08)',  
          borderRadius: '16px',  
        },  
      },  
    },  
  },  
});

const SENSOR\_STATIONS \= \[  
  { id: 'S1', name: 'Stasiun Jakarta Pusat', lat: \-6.18, lng: 106.83, rain: 48, temp: 29.5 },  
  { id: 'S2', name: 'Stasiun Jakarta Selatan', lat: \-6.26, lng: 106.81, rain: 92, temp: 26.8 },  
  { id: 'S3', name: 'Stasiun Jakarta Barat', lat: \-6.16, lng: 106.75, rain: 10, temp: 32.4 },  
  { id: 'S4', name: 'Stasiun Jakarta Timur', lat: \-6.22, lng: 106.90, rain: 70, temp: 28.1 },  
  { id: 'S5', name: 'Stasiun Depok', lat: \-6.40, lng: 106.81, rain: 110, temp: 24.9 },  
  { id: 'S6', name: 'Stasiun Tangerang', lat: \-6.17, lng: 106.63, rain: 2, temp: 33.8 },  
\];

export default function NirmalaDashboard() {  
  const \[activeLayer, setActiveLayer\] \= useState('rain');  
  const \[showMarkers, setShowMarkers\] \= useState(true);  
  const \[isPlaying, setIsPlaying\] \= useState(false);  
  const \[timeStep, setTimeStep\] \= useState(12);

  useEffect(() \=\> {  
    let interval;  
    if (isPlaying) {  
      interval \= setInterval(() \=\> {  
        setTimeStep((prev) \=\> (prev \>= 24 ? 0 : prev \+ 1));  
      }, 800);  
    }  
    return () \=\> clearInterval(interval);  
  }, \[isPlaying\]);

  return (  
    \<ThemeProvider theme={nirmalaTheme}\>  
      \<CssBaseline /\>  
      \<Box sx={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', bgcolor: '\#050811' }}\>  
        \<Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }}\>  
          \<div  
            style={{  
              width: '100%',  
              height: '100%',  
              backgroundImage:  
                'radial-gradient(\#1e293b 1px, transparent 1px), linear-gradient(to right, \#0f172a 1px, transparent 1px), linear-gradient(to bottom, \#0f172a 1px, transparent 1px)',  
              backgroundSize: '40px 40px, 80px 80px, 80px 80px',  
              backgroundColor: '\#070c18',  
            }}  
          /\>  
        \</Box\>

        \<Paper  
          sx={{  
            position: 'absolute',  
            top: 20,  
            left: 20,  
            right: 20,  
            zIndex: 100,  
            px: 3,  
            py: 1.5,  
            display: 'flex',  
            alignItems: 'center',  
            justifyContent: 'space-between',  
          }}  
        \>  
          \<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}\>  
            \<Avatar sx={{ bgcolor: 'primary.main', color: '\#000' }}\>  
              \<Icon icon="solar:cloud-waterdrops-bold-duotone" width="28" /\>  
            \</Avatar\>  
            \<Box\>  
              \<Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}\>  
                NIRMALA  
              \</Typography\>  
              \<Typography variant="caption" color="text.secondary"\>  
                Geospatial Weather & Telemetry Radar Platform  
              \</Typography\>  
            \</Box\>  
          \</Box\>

          \<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}\>  
            \<Chip  
              icon={\<Icon icon="solar:radar-bold" color="\#00e5ff" /\>}  
              label="Active Sensor Nodes (6)"  
              variant="outlined"  
              size="small"  
              sx={{ borderColor: 'rgba(0, 229, 255, 0.3)' }}  
            /\>  
            \<IconButton color="inherit"\>  
              \<Icon icon="solar:bell-bing-bold-duotone" width="22" /\>  
            \</IconButton\>  
            \<IconButton color="inherit"\>  
              \<Icon icon="solar:user-circle-bold-duotone" width="24" /\>  
            \</IconButton\>  
          \</Box\>  
        \</Paper\>

        \<Paper  
          sx={{  
            position: 'absolute',  
            top: 95,  
            left: 20,  
            zIndex: 100,  
            p: 2,  
            width: 240,  
            display: 'flex',  
            flexDirection: 'column',  
            gap: 1.5,  
          }}  
        \>  
          \<Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: '0.75rem' }}\>  
            METRIC METEOROLOGI  
          \</Typography\>

          \<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}\>  
            \<Button  
              variant={activeLayer \=== 'rain' ? 'contained' : 'outlined'}  
              startIcon={\<Icon icon="solar:cloud-rain-bold-duotone" /\>}  
              onClick={() \=\> setActiveLayer('rain')}  
              fullWidth  
              sx={{ justifyContent: 'flex-start' }}  
            \>  
              Intensitas Hujan  
            \</Button\>  
            \<Button  
              variant={activeLayer \=== 'temp' ? 'contained' : 'outlined'}  
              color="secondary"  
              startIcon={\<Icon icon="solar:thermometer-bold-duotone" /\>}  
              onClick={() \=\> setActiveLayer('temp')}  
              fullWidth  
              sx={{ justifyContent: 'flex-start' }}  
            \>  
              Suhu Udara  
            \</Button\>  
          \</Box\>

          \<Divider sx={{ my: 0.5 }} /\>

          \<FormControlLabel  
            control={  
              \<Switch  
                checked={showMarkers}  
                onChange={(e) \=\> setShowMarkers(e.target.checked)}  
                color="primary"  
                size="small"  
              /\>  
            }  
            label={\<Typography variant="body2" sx={{ fontSize: '0.85rem' }}\>Sensor Station Dots\</Typography\>}  
          /\>  
        \</Paper\>

        \<Paper  
          sx={{  
            position: 'absolute',  
            top: 95,  
            right: 20,  
            zIndex: 100,  
            p: 2,  
            width: 190,  
          }}  
        \>  
          \<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}\>  
            SKALA {activeLayer \=== 'rain' ? 'HUJAN (mm/jam)' : 'SUHU (°C)'}  
          \</Typography\>  
          \<Box  
            sx={{  
              height: 10,  
              borderRadius: 1,  
              background:  
                activeLayer \=== 'rain'  
                  ? 'linear-gradient(to right, rgba(0,229,255,0.4), \#00e676, \#ffeb3b, \#ff9800, \#f44336)'  
                  : 'linear-gradient(to right, \#002699, \#00e5ff, \#ffeb3b, \#ff4081)',  
              mb: 1,  
            }}  
          /\>  
          \<Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '\#94a3b8' }}\>  
            \<span\>{activeLayer \=== 'rain' ? 'Rendah (0)' : 'Dingin (20°)'}\</span\>  
            \<span\>{activeLayer \=== 'rain' ? 'Ekstrem (100+)' : 'Panas (36°)'}\</span\>  
          \</Box\>  
        \</Paper\>

        \<Paper  
          sx={{  
            position: 'absolute',  
            bottom: 25,  
            left: '50%',  
            transform: 'translateX(-50%)',  
            zIndex: 100,  
            px: 3,  
            py: 1.5,  
            width: '80%',  
            maxWidth: 800,  
            display: 'flex',  
            alignItems: 'center',  
            gap: 2.5,  
          }}  
        \>  
          \<IconButton  
            color="primary"  
            onClick={() \=\> setIsPlaying(\!isPlaying)}  
            sx={{ bgcolor: 'rgba(0, 229, 255, 0.12)' }}  
          \>  
            \<Icon icon={isPlaying ? 'solar:pause-bold' : 'solar:play-bold'} width="24" /\>  
          \</IconButton\>

          \<Box sx={{ flex: 1 }}\>  
            \<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}\>  
              \<Typography variant="caption" color="text.secondary"\>  
                Simulasi Forecast Telemetri  
              \</Typography\>  
              \<Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 'bold' }}\>  
                {String(timeStep).padStart(2, '0')}:00 WIB  
              \</Typography\>  
            \</Box\>  
            \<Slider  
              value={timeStep}  
              min={0}  
              max={24}  
              step={1}  
              onChange={(\_, val) \=\> setTimeStep(val)}  
              valueLabelDisplay="auto"  
              valueLabelFormat={(v) \=\> \`${v}:00\`}  
            /\>  
          \</Box\>  
        \</Paper\>

      \</Box\>  
    \</ThemeProvider\>  
  );  
}

## **9\. Optimization & Scaling Strategy**

1. **Zero Memory Copy (Transferable Objects)**:  
   self.postMessage({ buffer, width, height }, \[buffer\]);

2. **Downsampling & Dynamic Resolution**:  
   Saat drag/pan cepat, naikkan step \= 8 (kalkulasi 4x lebih cepat). Saat idle, turunkan step \= 2 atau 3\.  
3. **WebGL Migration (\> 500 Sensor Nodes)**:  
   Gunakan Fragment Shader WebGL jika titik stasiun bertambah hingga ribuan unit di seluruh Indonesia.

## **10\. Wind Flow Particle Engine (Simulasi Vektor Angin ala Ventusky)**

Efek animasi angin meliuk-liuk di Ventusky mengombinasikan **Lagrangian Particle System** dan **Bilinear Interpolation** medan vektor ![][image18] pada grid 2D.

### **Formulasi Matematika Vektor Angin**

Setiap partikel ![][image19] berada pada posisi piksel ![][image20] dan diperbarui setiap *frame* berdasarkan komponen kecepatan angin horisontal ![][image21] (timur-barat) dan vertikal ![][image22] (utara-selatan):

![][image23]![][image24]Untuk menghitung nilai ![][image18] di sembarang posisi ![][image6] di antara 4 titik grid terdekat ![][image25], digunakan **Interpolasi Bilinear**:

### **![][image26]Trik Animasi Canvas: Semi-Transparent Fade Overlay**

Guna menghasilkan jejak garis bercahaya (*trails*), Canvas tidak dibersihkan dengan clearRect(), melainkan ditimpa oleh *rectangle* hitam berkadar transparansi tinggi (![][image27]):

ctx.globalCompositeOperation \= 'destination-in';  
ctx.fillRect(0, 0, width, height);  
ctx.globalCompositeOperation \= 'lighter'; // Efek glowing garis angin

### **Implementasi Component: src/components/map/WindFlowLayer.jsx**

'use client';

import React, { useEffect, useRef } from 'react';

const PARTICLE\_COUNT \= 2500;  
const MAX\_AGE \= 80;

export default function WindFlowLayer({ map, windGrid }) {  
  const canvasRef \= useRef(null);  
  const animFrameRef \= useRef(null);

  useEffect(() \=\> {  
    if (\!map || \!windGrid || \!window.google) return;

    const canvas \= document.createElement('canvas');  
    canvas.style.position \= 'absolute';  
    canvas.style.top \= '0';  
    canvas.style.left \= '0';  
    canvas.style.pointerEvents \= 'none';  
    canvas.style.mixBlendMode \= 'screen';

    class WindOverlay extends window.google.maps.OverlayView {  
      onAdd() {  
        this.getPanes().overlayPane.appendChild(canvas);  
      }

      draw() {  
        const projection \= this.getProjection();  
        if (\!projection) return;

        const bounds \= map.getBounds();  
        if (\!bounds) return;

        const sw \= projection.fromLatLngToDivPixel(bounds.getSouthWest());  
        const ne \= projection.fromLatLngToDivPixel(bounds.getNorthEast());

        const width \= Math.ceil(Math.abs(ne.x \- sw.x));  
        const height \= Math.ceil(Math.abs(sw.y \- ne.y));

        canvas.width \= width;  
        canvas.height \= height;  
        canvas.style.width \= \`${width}px\`;  
        canvas.style.height \= \`${height}px\`;  
        canvas.style.left \= \`${sw.x}px\`;  
        canvas.style.top \= \`${ne.y}px\`;

        initParticleSystem(canvas, width, height);  
      }

      onRemove() {  
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);  
      }  
    }

    const overlay \= new WindOverlay();  
    overlay.setMap(map);

    function initParticleSystem(cvs, width, height) {  
      const ctx \= cvs.getContext('2d');  
      if (\!ctx) return;

      // Inisialisasi Pool Partikel  
      const particles \= \[\];  
      for (let i \= 0; i \< PARTICLE\_COUNT; i++) {  
        particles.push({  
          x: Math.random() \* width,  
          y: Math.random() \* height,  
          age: Math.floor(Math.random() \* MAX\_AGE),  
        });  
      }

      function renderFrame() {  
        // Efek trailing garis angin  
        ctx.fillStyle \= 'rgba(5, 8, 17, 0.92)';  
        ctx.globalCompositeOperation \= 'destination-in';  
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation \= 'lighter';  
        ctx.strokeStyle \= '\#00e5ff';  
        ctx.lineWidth \= 1.2;

        ctx.beginPath();  
        for (let i \= 0; i \< particles.length; i++) {  
          const p \= particles\[i\];

          // Ambil komponen vektor u, v dari windGrid (interpolasi sederhana)  
          const u \= 2.5; // Contoh kecepatan arah timur (px/frame)  
          const v \= Math.sin(p.x \* 0.01) \* 1.5; // Variasi gelombang vertikal

          const oldX \= p.x;  
          const oldY \= p.y;

          p.x \+= u;  
          p.y \+= v;  
          p.age++;

          // Draw line segment  
          ctx.moveTo(oldX, oldY);  
          ctx.lineTo(p.x, p.y);

          // Respawn partikel jika keluar layar atau melebihi MAX\_AGE  
          if (p.x \> width || p.y \> height || p.x \< 0 || p.y \< 0 || p.age \> MAX\_AGE) {  
            p.x \= Math.random() \* width;  
            p.y \= Math.random() \* height;  
            p.age \= 0;  
          }  
        }  
        ctx.stroke();

        animFrameRef.current \= requestAnimationFrame(renderFrame);  
      }

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);  
      renderFrame();  
    }

    return () \=\> {  
      overlay.setMap(null);  
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);  
    };  
  }, \[map, windGrid\]);

  return null;  
}

## **11\. Real-time Telemetry Streaming Architecture (WebSocket & SSE)**

Untuk platform monitoring geospasial real-time, memperbarui State React pada setiap *packet drop* dari puluhan sensor akan memicu *render bottleneck*. Kita membutuhkan **Batching Buffer** dan **Throttling Mechanism**.

### **Perbandingan Protocol IoT: SSE vs WebSocket**

| Fitur | Server-Sent Events (SSE) | WebSocket (WS) |
| :---- | :---- | :---- |
| **Arah Data** | Unidirectional (Server ![][image28] Client) | Bidirectional (Client ![][image29] Server) |
| **Karakteristik** | Sangat cocok untuk telemetri sensor & radar broadcast. | Cocok untuk obrolan/kontrol dua arah. |
| **Auto Reconnect** | Bawaan browser (EventSource) | Harus buat retry loop manual. |
| **Penggunaan Nirmala** | **Diutamakan untuk Telemetri Sensor** | Dipakai jika ada kontrol sensor *remote command*. |

### **Arsitektur Data Flow Streaming:**

\[ Sensor Node IoT \] ──\> \[ Message Broker / MQTT \]  
                                 │  
                                 ▼  
                     \[ Next.js SSE Endpoint \]  
                                 │  
                                 ▼ (EventSource Connection)  
                     \[ Custom Hook: useSensorStream \]  
                                 │  
                 ┌───────────────┴───────────────┐  
                 ▼                               ▼  
       \[ Ring Buffer Queue \]            \[ Throttled RAF Batch \]  
   (Menampung telemetry payload)     (Update State 1x per 100ms)  
                 │                               │  
                 └───────────────┬───────────────┘  
                                 ▼  
                     \[ Canvas Heatmap Redraw \]

### **Script Custom Hook: src/hooks/useSensorStream.js**

import { useEffect, useState, useRef } from 'react';

export function useSensorStream(initialStations) {  
  const \[stations, setStations\] \= useState(initialStations);  
  const bufferRef \= useRef({});  
  const rafIdRef \= useRef(null);

  useEffect(() \=\> {  
    // Inisialisasi Server-Sent Events (SSE) Stream  
    const eventSource \= new EventSource('/api/telemetry/stream');

    eventSource.onmessage \= (event) \=\> {  
      try {  
        const payload \= JSON.parse(event.data); // { stationId: 'S1', rain: 65, temp: 28.4 }  
          
        // Simpan ke Ring Buffer, jangan langsung setStations()\!  
        bufferRef.current\[payload.stationId\] \= payload;  
      } catch (err) {  
        console.error('Failed to parse SSE telemetry payload:', err);  
      }  
    };

    // Batching loop dengan RequestAnimationFrame & Throttling  
    let lastFlushTime \= performance.now();

    const flushBuffer \= (now) \=\> {  
      // Flush buffer ke state React maksimal setiap 200 ms  
      if (now \- lastFlushTime \> 200 && Object.keys(bufferRef.current).length \> 0\) {  
        setStations((prev) \=\>  
          prev.map((st) \=\> {  
            const update \= bufferRef.current\[st.id\];  
            return update ? { ...st, ...update } : st;  
          })  
        );  
        bufferRef.current \= {}; // Clear buffer  
        lastFlushTime \= now;  
      }  
      rafIdRef.current \= requestAnimationFrame(flushBuffer);  
    };

    rafIdRef.current \= requestAnimationFrame(flushBuffer);

    return () \=\> {  
      eventSource.close();  
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);  
    };  
  }, \[\]);

  return stations;  
}

## **12\. Geospatial Data Tiling & Multi-Level Caching Strategy (Zoomed-Out Optimization)**

Saat pengguna melakukan *zoom-out* ke skala nasional (misal Zoom Level ![][image30]), menghitung IDW piksel demi piksel untuk ratusan stasiun sensor di area geografis yang luas (![][image31]) akan memicu kelambatan. Diperlukan strategi pencapaian 60 FPS melalui **Adaptive Level of Detail (LoD)**, **Spatial Clustering (QuadTree)**, serta **IndexedDB Tile Caching**.

### **12.1. Dynamic Adaptive Level of Detail (LoD) Step Matrix**

Alih-alih memproses setiap piksel (![][image32]), kita menyesuaikan *sampling step size* berdasarkan tingkat *zoom level* Google Maps (![][image33]):

![][image34]Dengan *step size* ![][image35], jumlah iterasi kalkulasi IDW di Web Worker berkurang hingga ![][image36] dari jumlah total piksel. Kanvas kemudian diperhalus secara otomatis oleh GPU browser dengan properti CSS: image-rendering: smooth.

### **12.2. Spatial Clustering dengan QuadTree**

Untuk menghindari kalkulasi jarak dari piksel ke titik sensor yang tidak relevan di luar *viewport*:

1. Stasiun sensor diindeks ke dalam struktur data **QuadTree**.  
2. Saat *Zoom Out* (![][image30]), sensor-sensor yang berdekatan (![][image37]) dikelompokkan (*clustered*) menjadi satu **Centroid Node** dengan nilai rata-rata terbobot:  
3. ![][image38]Web Worker hanya memproses titik-titik *Centroid Node* ini, sehingga jumlah titik acuan ![][image39] dalam formula IDW berkurang drastis dari ratusan menjadi belasan titik kunci.

### **12.3. Browser Tile & Vector Caching Architecture**

\[ Google Maps Viewport \]  
          │  
          ▼ (Check Bounding Box & Zoom z)  
┌──────────────────────────────────────────┐  
│  Client In-Memory LRU Cache (Map/Set)    │ ─── (HIT: \< 2ms) ───\> \[ Render Directly \]  
└──────────────────────────────────────────┘  
          │ (MISS)  
          ▼  
┌──────────────────────────────────────────┐  
│  IndexedDB Storage Layer ('nirmala-tiles')│ ─── (HIT: \< 15ms) ──\> \[ Hydrate to Canvas \]  
└──────────────────────────────────────────┘  
          │ (MISS)  
          ▼  
┌──────────────────────────────────────────┐  
│  Web Worker IDW / Tile Server Vector Fetch│ ─── (Calculated) ───\> \[ Save to Cache & Render \]  
└──────────────────────────────────────────┘

### **Implementasi IndexedDB Cache Utility: src/lib/tileCache.js**

import { openDB } from 'idb';

const DB\_NAME \= 'NirmalaTileCacheDB';  
const STORE\_NAME \= 'heatmap\_tiles';

export const tileCache \= {  
  async getDb() {  
    return openDB(DB\_NAME, 1, {  
      upgrade(db) {  
        if (\!db.objectStoreNames.contains(STORE\_NAME)) {  
          db.createObjectStore(STORE\_NAME);  
        }  
      },  
    });  
  },

  async getTile(tileKey) {  
    try {  
      const db \= await this.getDb();  
      const record \= await db.get(STORE\_NAME, tileKey);  
      if (\!record) return null;  
        
      // TTL Check (Cache valid selama 5 menit untuk data telemetri)  
      if (Date.now() \- record.timestamp \> 300000\) {  
        await db.delete(STORE\_NAME, tileKey);  
        return null;  
      }  
      return record.buffer;  
    } catch (err) {  
      console.error('Failed reading tile cache:', err);  
      return null;  
    }  
  },

  async setTile(tileKey, buffer) {  
    try {  
      const db \= await this.getDb();  
      await db.put(  
        STORE\_NAME,  
        { buffer, timestamp: Date.now() },  
        tileKey  
      );  
    } catch (err) {  
      console.error('Failed saving tile cache:', err);  
    }  
  }  
};

## **13\. Backend REST & Kafka Telemetry API Contract Specifications**

Backend Nirmala beroperasi pada infrastruktur **Rainvision Kafka Pipeline** (http://172.18.188.154:8000). Berikut adalah spesifikasi endpoint REST API resmi, contoh payload JSON, dan pemetaannya pada layer UI Front-End.

### **13.1. Endpoint Matrix Summary**

| Method | Endpoint Path | Deskripsi & Kegunaan UI | Frekuensi Refresh |
| :---- | :---- | :---- | :---- |
| GET | /api/sensors | Mendapatkan daftar seluruh stasiun sensor (4.500+ node), koordinat Lat/Lng, status aktif/blacklisted, dan indikator hujan. | Every 30s / SSE |
| GET | /api/lightning | Real-time events sambaran petir (signalStrengthKA, cloud/ground strike). | Every 10s |
| GET | /api/thunderstorm | Poligon sel badai petir GeoJSON (polygon.coordinates) & centroid. | Every 30s |
| GET | /api/manifest | Metadata sesi user, akun permissions, default koordinat map, dan total message Kafka. | On App Load |
| GET | /api/health | Diagnostic status Kafka pipeline (uptime\_s, messages\_consumed, state counts). | Every 60s |
| GET | /api/topics | Daftar topic Kafka aktif yang dikonsumsi oleh backend stream. | Diagnostic |
| GET | /api/timeseries/{sensor\_id} | Data historis sensor 24 jam untuk grafik inspector drawer. | On Demand (OnClick) |
| GET | /api/raw/{topic\_name}?limit=20 | Inspection raw Kafka queue messages (Debug Mode). | Developer Panel |

### **13.2. Detailed JSON Schema & Response Payloads**

#### **1\. Sensor Station Telemetry Endpoint (GET /api/sensors)**

* **URL**: http://172.18.188.154:8000/api/sensors  
* **Response Payload**:

{  
  "scraped\_at\_utc": "2026-08-14T06:05:31Z",  
  "bounds": {  
    "north": 6.5,  
    "south": \-11.5,  
    "east": 141.5,  
    "west": 94.5  
  },  
  "filters": {  
    "active": true,  
    "bignet": true,  
    "inactive": true,  
    "blacklisted": true  
  },  
  "total\_items": 4582,  
  "alert": "Live: 4582 sensor · 4506 aktif · 71 hujan · 76 blacklist",  
  "sensors": \[  
    {  
      "id": "bignet\_1093",  
      "latitude": \-2.796992,  
      "longitude": 100.143703,  
      "blacklisted": true,  
      "manual\_blacklisted": false,  
      "inactive": false,  
      "unavailable": false,  
      "status": "blacklisted",  
      "is\_raining": false,  
      "last\_update": "2026-08-14T04:45:00",  
      "\_scraped\_at": "2026-08-14T06:05:31Z",  
      "\_type": "sensor"  
    },  
    {  
      "id": "bignet\_2103",  
      "latitude": 1.117967,  
      "longitude": 121.414973,  
      "blacklisted": false,  
      "manual\_blacklisted": false,  
      "inactive": false,  
      "unavailable": false,  
      "status": "active",  
      "is\_raining": true,  
      "last\_update": "2026-08-14T07:30:00",  
      "\_scraped\_at": "2026-08-14T06:05:31Z",  
      "\_type": "sensor"  
    }  
  \]  
}

* **FE Mapping**:  
  * bounds: Menjadi acuan viewport default Google Maps (fitBounds).  
  * sensors\[\].is\_raining: Jika true, dimasukkan sebagai *point source* IDW Rain Heatmap Engine dengan intensitas terinterpolasi.  
  * sensors\[\].blacklisted: Dapat difilter oleh toggler "Tampilkan Sensor Blacklist" di UI.

#### **2\. Lightning Strikes Event Stream (GET /api/lightning)**

* **URL**: http://172.18.188.154:8000/api/lightning  
* **Response Payload**:

{  
  "request\_time": "2026-08-12 16:20 (UTC)",  
  "content": \[  
    {  
      "long": 120.1242,  
      "lat": 14.362,  
      "cloud": false,  
      "signalStrengthKA": \-95.5,  
      "time": "2026-08-12 16:10 (UTC)",  
      "request\_time": "2026-08-12 16:20 (UTC)",  
      "\_type": "lightning"  
    },  
    {  
      "long": 120.0742,  
      "lat": 14.3495,  
      "cloud": false,  
      "signalStrengthKA": \-16.7,  
      "time": "2026-08-12 16:10 (UTC)",  
      "request\_time": "2026-08-12 16:20 (UTC)",  
      "\_type": "lightning"  
    }  
  \]  
}

* **FE Mapping**:  
  * lat, long: Dirender sebagai titik kilatan petir dengan pendaran cahaya (*glowing pulse animation*).  
  * signalStrengthKA: Menentukan radius dan intensitas kecerahan warna kilatan petir pada Canvas.

#### **3\. Thunderstorm Cells GeoJSON (GET /api/thunderstorm)**

* **URL**: http://172.18.188.154:8000/api/thunderstorm  
* **Response Payload**:

{  
  "request\_time": "2026-08-12 17:00 (UTC)",  
  "content": \[  
    {  
      "stormId": 300762257,  
      "referenceTime": "2026-08-12 17:00 (UTC)",  
      "severe": false,  
      "centroid": {  
        "type": "Point",  
        "coordinates": \[125.97842, 20.50554\]  
      },  
      "polygon": {  
        "type": "Polygon",  
        "coordinates": \[  
          \[  
            \[125.93555, 20.26403\],  
            \[125.89202, 20.26976\],  
            \[125.84641, 20.2831\],  
            \[125.80585, 20.2999\],  
            \[125.93555, 20.26403\]  
          \]  
        \]  
      },  
      "request\_time": "2026-08-12 17:00 (UTC)",  
      "\_type": "thunderstorm"  
    }  
  \]  
}

* **FE Mapping**:  
  * polygon.coordinates: Dirender menggunakan CanvasRenderingContext2D.beginPath() dan lineTo() sebagai Poligon Sel Badai dengan *fill color* bercahaya.  
  * severe: Jika true, gunakan warna batas merah pekat (\#ef4444); jika false, gunakan warna ungu radar (\#a855f7).

#### **4\. Platform Manifest & User Session (GET /api/manifest)**

* **URL**: http://172.18.188.154:8000/api/manifest  
* **Response Payload**:

{  
  "source": "kafka://rainvision (live)",  
  "scraped\_at\_utc": "2026-08-14T06:05:31Z",  
  "live": true,  
  "account": {  
    "permissions": {  
      "can\_view\_sensor": true,  
      "can\_view\_lightning": true,  
      "can\_view\_radar": true,  
      "can\_view\_himawari": true  
    },  
    "is\_admin": false,  
    "is\_indonesia": true,  
    "default\_map": {  
      "lat": \-2.5,  
      "lng": 118,  
      "zoom": 6.5  
    },  
    "default\_layer": "sensor"  
  },  
  "datasets": {  
    "sensors": { "count": 4582 },  
    "thunderstorm": { "count": 7 },  
    "lightning": { "count": 586 },  
    "messages\_consumed": {  
      "rainvision.sensors": 138913,  
      "rainvision.lightning": 19924,  
      "rainvision.thunderstorm": 646,  
      "rainvision.sensor.rain": 235522152,  
      "rainvision.sensor.signal": 275027236  
    }  
  }  
}

* **FE Mapping**:  
  * account.default\_map: Inisialisasi posisi kamera peta Next.js pada Lat \-2.5, Lng 118, Zoom 6.5.  
  * permissions: Digunakan oleh AuthGuard.jsx untuk mengatur hak akses tombol layer di Header Navbar.

#### **5\. Pipeline Health Diagnostic (GET /api/health)**

* **URL**: http://172.18.188.154:8000/api/health  
* **Response Payload**:

{  
  "connected": true,  
  "uptime\_s": 73240,  
  "scraped\_at\_utc": "2026-08-14T06:05:31Z",  
  "messages\_consumed": {  
    "rainvision.sensors": 138913,  
    "rainvision.lightning": 19924,  
    "rainvision.thunderstorm": 646,  
    "rainvision.sensor.rain": 237850781,  
    "rainvision.sensor.signal": 278106045  
  },  
  "last\_message\_epoch": {  
    "rainvision.sensors": 1786687534.305358,  
    "rainvision.lightning": 1786687540.0191615,  
    "rainvision.thunderstorm": 1786687542.9712899,  
    "rainvision.sensor.rain": 1786690069.213928,  
    "rainvision.sensor.signal": 1786690069.2335  
  },  
  "state": {  
    "sensors": 4582,  
    "storms": 7,  
    "lightning": 586,  
    "sensors\_with\_rain": 4475,  
    "sensors\_with\_signal": 4582  
  }  
}

#### **6\. Kafka Topics List (GET /api/topics)**

* **URL**: http://172.18.188.154:8000/api/topics  
* **Response Payload**:

{  
  "topics": \[  
    "rainvision.sensors",  
    "rainvision.lightning",  
    "rainvision.thunderstorm",  
    "rainvision.sensor.rain",  
    "rainvision.sensor.signal"  
  \]  
}

#### **7\. Raw Kafka Topic Stream Preview (GET /api/raw/rainvision.sensors?limit=20)**

* **URL**: http://172.18.188.154:8000/api/raw/rainvision.sensors?limit=20  
* **Response Payload**:

{  
  "topic": "rainvision.sensors",  
  "messages": \[  
    {  
      "id": "bignet\_925",  
      "latitude": 0.785809,  
      "longitude": 113.140992,  
      "blacklisted": false,  
      "manual\_blacklisted": false,  
      "inactive": false,  
      "unavailable": false,  
      "status": "active",  
      "is\_raining": false,  
      "last\_update": "2026-08-14T06:35:00",  
      "\_scraped\_at": "2026-08-14T06:52:57Z",  
      "\_type": "sensor"  
    }  
  \]  
}

### **13.3. Client-Side Network Client Utility (src/lib/axios.js)**

import axios from 'axios';

const API\_BASE\_URL \= process.env.NEXT\_PUBLIC\_API\_BASE\_URL || 'http://172.18.188.154:8000';

export const nirmalaApi \= axios.create({  
  baseURL: API\_BASE\_URL,  
  timeout: 15000,  
  headers: {  
    'Content-Type': 'application/json',  
    'Accept': 'application/json',  
  },  
});

// Response Interceptor for Error Diagnostics  
nirmalaApi.interceptors.response.use(  
  (response) \=\> response.data,  
  (error) \=\> {  
    console.error('\[Nirmala API Error\]:', error?.response?.status || error.message);  
    return Promise.reject(error);  
  }  
);  


[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAZCAYAAADXPsWXAAAAwklEQVR4XmNgGAXYAKO8vPwHIP6PhN+iKwKK/UWS/4suDwZycnLzQQoUFBQc0OVgACSPLoYCgJoToLZUo8uBAFB+I9AiY3RxFCArK6sMNWQbupyUlBQXUPwZujhWADXkIxbxX+hiOAHUEBR/A/nJQFyDLIYX4DAEf2CiA3RDgOxrKioqoshqCAKgpu8wQ6ABfQRdDUEA1DQPZAjQAD8gfQ9dniiAlFZICwdkANSsCDIAaFg6uhxJAGjIaXSxUTAKqAEAdVk6FQkNcvsAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAaCAYAAAC+aNwHAAAA7klEQVR4Xu2SIQ7CQBREi0Jhce2SbJMaBGdosHjuwgUQSBSKg2BBoDDQ4FC4BggkDQECs+F30/37Udi+ZEI6M51uQ4OgxkEpNYEu0JtUQDn0KL0O4Pd5lGXBXxg/DEPNMwcaWAp+StmWZxaccGhKURT1eQZ/RtmcZxYUdtLxDfR0MbNIJZyqB+8JHaq+CA3kuGmN3w10N14cx03e9SjfH0qrPq4zfioRlPZSEcNj42ut2zxzoKd7A/Bu5Dd45kADqx++N+yAwsiU8B8PhMwZcMZwMYWu0El9v/sz9LIFgE+3SyNHqEiSpFXNa2r+5gNuhllQAOdc9AAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE4AAAAZCAYAAACfIRhSAAADl0lEQVR4Xu2XSWhUQRCGo0YUDyruzJI3mRnQCB5k9CKIong1GNSLG+jBBRTEBQWDSxAxGAkSIq64ERERD3oQgohHPRi8eBLENSYGMWKMGrf/z1SbepUeB8FDYN4PzXv1dVV1v3rdPW/KyiJFiiRKJpMZyyIVUSKRmJVKpTZbHqmIgiBo13Y2mx0F9gttmeaRjFCgj9rG6tsjhXuieSQlFGd9RUXFYg+vsiySEgr007IhJ0yyRrbBedo8S2Bvxxvfn8vlRjo/2Lvpg0M7OxDdH78K/gdxvUo7k8kkcd8A/zXOJxaLTQI7Tg6z/E9wAcHvsbYx5gSMsRG8Hu2G7QNrwngv0O7E4/GJuh+/zPPRvwPxp9DGAw2HvQH3jXjWsc4PbAtaC/jCgei/CM470V4H+fOjBoNvJcf1CFllZSUuwT0yJJ1BhsksVfG1EsvWiri08E60PuZB3CZhDfTD7TAXb4X+E8gf0wzxKfBmGeOH7hPWwvt0Oj2ONtwPuH6MvxrskfgtQjtNzmcQ32m4PiNDISeLH19wcXEVSZJrmkuS0LYR9t6wK+SY5EzFZovvJeNLv22aabHfMifJ5yvcLmVf9+UQv+ceFvKF/dWygpI32r+6NJfEzR4WSoxCXLAMdhUZtu4Uw0MrQktWzGXLnWTsUOGs0H/MzkU4x11nWWB+pWF3++K9wrmQKPSQaPUeZot01jK3inG+jdFc4g9p5oQXcB+XEZY7SWyocHjZ08nQelGYvbies3OhyJB/pWWIeWhYly/eKzxknM48aDWXxEcts4lhn7GMf5fI/qVwNoeVxH53NuZWLXOsVj77fHkktsYyFPOBYTybB8V75bYqf/00l8GKrjjfVi2y4uo0o1DoOYE6q3yS2G/GDo2LR2l0TPfxHvNcPuCZZ54V987mLCgkzMkkQh+YkviiZTYx7FseNk98Kw3nA5zUTHiHZVaSr1fZbZ5x+xwLZHXiGUaTpcx/X8n31LAem9MrOH1Be4P2Uq78VWlCeyvsFVq3fJ9xGTvWJfEfxCZnTF0wOOfnIL+dQznNPD5p26cg/6A9ht0WztZKxu0X5OdXzhWF+3YZl59dPehfgWuHMM6l/yuBMWKTd2IXzNVjDTnhQdaiLbHcSooTKnhJK1AHvpbbYu5sksLdtX4lKxSjzTJK/qqxcNxa/Orn2VPwX0dJCcWoxbfYVMudULQ0fG6iHbZ9JS1sxwWWRYoUKdJ/0m8BkGldsCcKnwAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAaCAYAAABozQZiAAAAtklEQVR4XmNgGKFAXl5+MxD/Jxaja/4vJycXhi6GrlBBQUEDRUxGRkYIKLAZSQ0IMEE1X0ATZwBa8gjOASrYCqQYEdJgGwpAmoG0P7K4lpYWG1C8Dy4ANCkfSR4MgAreozsZBICGCSgqKoqji6MAbP4lFjBDNZ9BlyAIgN4oh2r2RpcjCICaPpPrZPL9C40K8vwL1DQbpBkYJQnoclgBUHEQEH+Th8TtWygG+fsXWc4fBaMAGQAAFWtDHXCLXPIAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAZCAYAAADaILXQAAABEklEQVR4XmNgGAXUAsrKyrLy8vJ9QDxZRkZGGiYuJyfngqwOJpgLVHgbiN/Iysr6ocvDAFCdNVDNfyD+DsTNQLU6QLoIxDc2NmYFyaFoACpQBgpqwvgKCgr26urqvMhqQACoZgrU4BJ0OSBghMqhGg40rANFACKWgcxXVFQUh2reiyyODIB6ErAZrgF0vRSMD/IqMByFkNVgdRUWgFUNULAFGJ4HgRadAtJ5WOTJNxwfAGoIItZwkgHQN4k0MxyapmljOAgQazhQzWt0MYIAqOk4yHBgZBujyyEDYhyAFRByPdBiXyAOQxcnCsCyNxD/BnJZkOWAmcwOKH4XWYwsAHRdO8wXQPwJSreiqxsFo2CkAADd+k+61VLNywAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAACjklEQVR4Xu2VzatNURjGD25CKR8Ddb72+YhTR0l3IBn4GkhKShkZ3ISSkcjnwB9wSyghExkZGNyShDklAyMJSQzENbgplBR+77XWsTx773XOMTj3Ds6v3s5az3rW+6619zp7FQpDZiH1en2baoOkVqutVa1nmHyIOKX6oEmS5JdqXWk2mxUmvld9JmAddWJK9Si2a57+AtVnCtbztVqt7lQ9E8wbiO+qzyTlcnllz0cJ44/ZcPYV20CxWFykegozsuOFqnsY30FcY5NLrM+r3UP7Bs15Yo3CF24NeW4yf6kMjfjcIbYuYlz1f2i1Wotjr8rOYqlUWt5ut+ebj+L3+N1KwU2xeYrNIc5lzXMLfR1qBt4HSbejjWGLJvSgT7Dg1UHfCk0G7Z9/3XF8DfJd13ou1+FQM/BeVW8Kdrkvz4R+RvpW6IDr9nV8qLPZfl2OF16nPerqz/Gahw2czFtbBxKPdTUVps/vul58MewPaTnkrd7Jy4t+PG+sAxtY39VUmH4a93vxxaDWRc1h/STn0qLmFfWnsC9Cngl9knjr2lboox+rVCrFmnx6yXU27CvMf661XN6joeZxH4xvqqewJPaVydKJy/5SId6EY+KdcJ67oR7C2KVwHgt87PpzA1sHG+MhXVA9hSt8LEN/5MYeuv6U9Sn8Tr1schljn8IFZsH4M5fT4mnM72rpnZEG0wnMX1T/H8jzWTUPY6PSt03cCjUPd085trkUzjyiej80Go1V5NmruoH+JFwQD+18bIHJn7e9W/VcOGvbmfBK9X5IIhcb+V8Sp62Nb79bfOZdwid7BeMfVO8Kk8Z5MgdV74PUZRTCBo4Qt4ldOhYSezNdIfmYaoOEp79RtSFDhmTzG26uvP0pM3hOAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAAAaCAYAAAC0NHJVAAAEQElEQVR4Xu2ZXYhVVRTHR7OCvgvGkfna984MDk0Q6TwJmVoRFPRhUQg+GEgvPaRFPRShT70UQwQ9GJZZUQaSgZRiD+aDPvQxhA+SKT0UUQ9iGuEHkmO/de8+w+I/+1zvnRnvvSPnB4uz93+vs87aH2ffc87t6CgoKCjoGBkZua63t/cO1duRcrn8kGozYmBgYHGpVHqvv7//0UwLIbzsfdoBcvpPtXbFFhT5/qN6w4yOjl5LoAls69DQ0C3M/n2UL2GvY/+qfyshn4sc5qvezpDzamxc9YawCeHuuTelY6+p3irIZRt3+m7V5wI2liz+LtXrgsnZbgFUN0y3u0z1VpGX51yA3Ndj51Svi3i3JDufp7cCFtPT7ZTPdJh2/tkkYWPa1k4wSb+T40HVM3ja66F9J9vhPVanXOacz9lihtV3OhDnbmLuIObt0rSAa94mWpI4zo+oflk46S03URUjkS3q12piXs+pbtC2C3sylu0B6BPs066urhvtPPVvFGLcj40xGSs0XhyzX72WB34X6MM+1euCE1+IF5s0EjqmfvUQV5wNUso+Ju5HXO9Dytuw97GtGiOF5cR5DyT0JdgOV//RfGP5bFaeCVmMmHdqkp73Wh74HcV+U71hSOTBeOEpnUM7pVqziDmVVSffZ3w9+v3hNYX206rVgoW10o4x9i+ZTnlpHKd5mUY+39lrTFb34Ls3Na414YSnVDNCddVPCUYCG1RrFpYPg1VSXYkDuV51x7y8fteiu7v7BovNGNyVadS/0nGi/oave2j7Wv1r0tfX9xh93qi6QaBXGgrm4Lwy9mYjpjFSWD7YKtU9tC8zP9VnA8bqHY0dc6p7d8H3Z+xv1XPBeRzbpbqBftE/PFDejHYEu9P7NZM4IFPuELTPssHjeCgru/aTrrwn1hc4lwr0cZNqnlAdYI1tOb1kZX6LKYb92Afex0PbeSb7G9VziRe41NnZeZPoXwT5FETgdWhjdORtrzcTrv8n9m1Ct36ccOXJgaR8uD8+Mg8ODi5k9xhEG6c/j2c+0e/LeO4er3toe9fHtt+eWK98oqJ83D76hupnqyTmz7WfUD2XUP1xnc/xdEzwlB25+Hb1NXyCrYDOPZvKAW1tzL+ysEL1brH6hL07JfynxIiDeyLV5gnV3cRim/2k/jZx5LnGax71n1VsNYYaK6RZzLSTnP9wcE9nSqjxtZq2pVK3idqpmq97bPJo/0v1WYPgB7C1l9u3rzShui1NvhM1CueeZ9vr47hf2+xvGuuj6gb6D34CbNvXCWESVqIdHx4evrmU+AJh/uiLVJ812MuXc5EjXGSFtjUbHZxGIP8Xse97enp6tY24E6plcM4x7FUrh+qHUsvhGnGrLILUIkJbhR1Q/aqFF8Xrw3S/Jtdm8oU0BZO0EdtdkoeOOrDf/TMqXvXYGz3b062qtyMhZwstKCgoKCiYK/wP1ZZJc/0wjKgAAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,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>

[image9]: <data:image/png;base64,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>

[image10]: <data:image/png;base64,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>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAbCAYAAABFuB6DAAAAvklEQVR4XmNgGAX0B/Ly8l+B+C0Qn5GTkxME0v8VFBQugWigNAtYkaKiohtQ0hmIlUASQPwAyYCjQPwPxvkCpbugJsABkN+NLgYS/I0uCOQ/RBcDCYKsvY5FDFMh0APh6GJA/AwuAPIQuk4gPxqqmQNZ8DhIEOhzH6gQE5QfBlcEVQjSeQtIX4Za90VWVlYKRRFMIcgqdHEUANTph+4+rACo6APUxCygp8TR5eEA6GAXkK+BbgwAchnR5YclAACjMD6n4VivBQAAAABJRU5ErkJggg==>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAABs0lEQVR4Xu2WzytEURTHZ0bK0k4xM2/GxoLdy16IDZJEmp0df4CVrZK9LMiPscPCRuIfoGRDUnZSig0LZUHxOePMdOfMTLGY5029T53evd/zve457ruvicUiIiJCSSaTOfU874t4IWZtPtRI4b7vN8uYRma0kWfrCyUUepxOpw+NdiRNpFKpMVcPJRT6KcXSxGRRY9ytp/Dkektks9kuTGscV6vMGfvyX6DjXuutN8lksoNC865GXX3awKWrF4ljuCLZr6Z7YkISPD9oZLvcHjzUcKKvUI/NSZH7PBKYRvXoOos5GlsWzbFXQH63RuRZv8Pf22K8SWwQ63b9L2iSGogLmyhAYlGf52I0uQOrBQ37v3s1Xp0ytMvbKtq/NcDeN5zintWrIoVinrYa8ehqFvIrfwm7vhbez+kvGe3BnZfgKzTkVb4+OdFoqsXVg4B7s8C+c65GjW3Us+pqJUicSbEsHFEpofOpMmMAsOeA7F0taGrY+gto8o7ntZrf+GS1W18Q2KLdIJ2w/gJqyFm9IZDfF9pdY0Lxr3oC83JRbD70cGkG5SvEHRhnGrf5iIiIiLryDehvj8ZWHzoTAAAAAElFTkSuQmCC>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADQAAAAaCAYAAAD43n+tAAACCklEQVR4Xu2VPUvDYBDHK74jitahQkPSlEixi0K/QEEQcVXELyAOTropDiK4iJsFJwfBFwRxdnISpIuDk1hw1EXcSq1v9X/tpT5cqrRJKxbygyPX/10uzz33JA0EfHz+F5FIZCgcDmtSbzrQyL5hGAW2ZRlvStDICDUEt03GmhJM6YQbaih4TlJqDYGPW1bq9ULX9XPUf8Y7OihjdQMP2IZtsE8NrckcLyQSiXbUvIXdW5bVKePVgqmOocYU3BYZK4KEFSS8kq9p2jA3U/DyUBVMYwD1nmBXgZ8WUQVY5x1qfMK24C/JeBE8bJ4Wj4QuW4N/Q5qa5wbUMGEvsDMZqxXUyNNkpe6Ap/FYQcupGoHm05han9QlyEvwTqZkzA2ot0troiMbKH11yZyTxiQmeToLqs7auqqxvim1SpimOcGbsipjbuBaBfqQKDYu8yjxiBJVDe+QxQ2Vj6BblEntyFgtcEN5qTtAUko2hN8HtobrIV2x43CNC9iemlst0WhUx71Z2KmMVQM39CZ1B6FQqEdtCP4032w3ZF8zmFwQ1w871w2xWKwXNR5glzL2G3S8aC1YQ7eizag5ZexktkXSjNIxoQJBJS+NYzj3facnWlH/mj7D8Xi8QwYrgVMyinveeZ05z2uhQlKrB9ioWak1HOxGEg1l6MjA75fxpsQo/UEeS93Hx8fH56/4Ap6zi9KZ+yJeAAAAAElFTkSuQmCC>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAAAaCAYAAABW6GksAAAEK0lEQVR4Xu2ZW0gVQRjHNe1C9yITTN1z1LDsAmFU1ksWVPYSFEG9BVpvvUQEUdGLBV0g6CHogmE+BBGYPURFF4ooCMG3ICKLBAkq0iAMSev/eb6x4e/Onku5R2N/MJyd//fNN7Pz7e7M7snJiYiIGMdUVVVNKi4unst6mMRisUWsRSTB87yfrIUNxtCOi2cZ6/8buTjRHpRfVvnCTtAGLPsA2wXVJ7CeDWSchYWF01gPE4zhE83rD5Qa26e0tPSJ7YP6OdueFDS4Kg3xmFnPNoPYWTPA1oS2t1nPFvF4fBPG9J31bKBJcT6JYHuGudvMekqg4R7t4AjbBNjbkNxq1g1BSc0WMiY8MhewHjY6r77zU1BQMB22LtZTpqSkpFw7uMO2oqKiqdC7WTcgoTtdA8smGFO7XM2sh01Q4ryAOzFltINeH72fNRsk7kPQBMlagzv2Bnw2SF2vshZ5nLFvMtDuEvrbyzrir/bRdrkmLExcicN57MMYD7OeNn4doF6PctTWGGnjN5kCbAdgO67Hb1AeoXTkJDZFsqbOpiZOvMQFlKfjrLX0Bh63waWHiaebFB99kLWM0AnhxI3okBEfJGcj6/qIfWfqOD5r4sH/biqxDfBtwk+eHss4t1q2z65YLt0Gd/5y+LU4yjVcXM26eWtCuYJymWMEAf9WGQfKYkt7jfmZZ/tljAYfPlEcv6qoqCiwffzQdnHWMSGr7Dp8vtnx0wHtjunvGY6h/bfamkFsmPgprIcJxnBQx9ggdWyYKjCmp+wniZRlh/WkIHCfmRTdrDjXLRudnBjrjA6+hfV00BgfLck8OldY2jBiq6ysnMF6mGBq1ugcNUvdzDFTXl4+P2jn7gQBH0jQsrKyUldwP3TihtccP6qrqyeKn1wQbEsH7Wu7qeNEDwWNNchmgE8c5XQ6hWMkYYKMA6UTybuIsoUd/grZRGgHXSh1bHehbepZR7z9YlOfE+bY4FOvQ5sltmaDR2+hT5te1myCbGGicySlh20C9LdeppsVNKzV4F/ZFgT8u1Ee++gSa+g9xQzc2GSxx9238o93Ypdp+/ghdtlMyDHaL5U6Yt1iPwG2HcnihYV1biM+CeIO3JaTeOT3Z/qBPl+D57IhiJh+dWFdd2sy4EFscibjt9GcAG9cBMRpg+096zaebv21nJdfJK6K/QTYnqO8YD0b6HgbWbcRH9ZGnX/VKZL3kjUD7rAiu46E3QvqV2yytrI+FsF5n5L1j/VRx0u8q1xnPV1ciUCS5uhVe0El8wLvu9DDf52X5IvPWMKcN3472TbquCY9VZCE+66XUvlYjPh9coxd7yxN2m72M3iJv5jyWR+rxBKfBDvkj2i2jTq6jg1NbiYgOQtZs0HsGpSbuJtOss0GPg89x3tdhAMkb6bcEayHCZK2lrWIiIiIiIiI8cFvTrtXTLoWPLIAAAAASUVORK5CYII=>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAF4AAAAaCAYAAAA+G+sUAAAEaElEQVR4Xu2Yy2tUVxzHTdRWpYVWDZrXnMmjRgZ1E8HHotKNqFDatNQKFkRrW7MRUSuK4FJRBDGg/QNs0ELVbqxt6cKt0K4KfSBduPDR1ldQqyYm+v1Ofsee+XomMzeTTgLeDxzuOd/f4zzuvec+Jk1KSXnhaWlpWalaSpwxW6tsNrsFZbfqKXFyudxLzrk+1RPR1tbWjCRXVffA9g/Kk6AMUFO/aoMx/I0yGIyL9aqNC311ofysetlw0Ljap6kekslkvqMfbrE5ahstyNfDnKongXcpc2B8H6itGox6TRC4HOWR6oq/qlSvBMt5S/UkIP7mWI8rCej7Y5QHqpcEQQPl7O22SI9VrwTmRN/bVE/C/3FBJGVU/TOoqalpuuohuI1ztkgH1VYM+G9C3BFUa0IdOebCtgbHjbZo3CfXhD5JYA70c1F1BX4nUd7zbcSsRTmFcSwN/RTEbEbpxRrNVJvH5lH+HDo6Ol5lkOoKBvcV/eivNqW1tXUefbHvObZRH2IbOT5jG5N9G+0dKH/agLezFGYpD+Tsttyr1BYCn0E7sr/3Ue4g5jVecBa/TmMaGxtn2TzetNjbFt+jvtD6Ma/vVS8KAt5iMtUV67CkHyYwjX4YxCdes4Vm7OTA1ee8EWpJQfxfpcbFxcW4jrJufRZsl6b9GGpex9i3+rY/EcjXHvoR6L+jXFa9KP52V12JDdjT0NAwo7Ozcyrr8Hmg+dA+oZrpBRMbDTau53J7YKvHFbsI1cl886Avxys+zLFDtGuaF+2dqnmgny9mi4KF31AqAGd4oQ3usNoI9F+DOv2uiZ3avVBrbm5eYP0W7P8JqbHcP6mB4KR+wTvQt+F3XOeK9rLYOCzvTdH6NN4D/VwxWxQMbGmpAEzgG/rg+LraCGz3efS5sraXB3Zqe0T7ulS/pUDObZb7HbURzW+LOSDadfUznb57I9rpUPNA/80leS3mYsY6DrEOoz7Q76GsZh238Gz1435Irb29/WXU3+DWZnHM+exzW+Mwrn1hOwZi7micB/ofWXkDoy/yHoho+3091BG/wrf93Hinei0Etofw/0H1EWFC/ndQndj/CC7SUKjbA/OxTtwm8hHrvM0tNu/jnt+SvrT6GfjOD2xnzf6t12KEuT1YmMUusiX4hdPXZvOrRf9LULoDnSc1/8DFsT7WVwhtiH9X9RGxpAUPF9P5oOTi5l8HpfCfyCMn/yns9Sx/QlDOWZ4rbOOEfOr9uNA+Fyf9X4Z8jpnO/g2Fugf6v274X1GxcfU7ue3Rx4exfNB+oZ4Z/t5QWy/KQ/6FxPFuLN4zkq0o6HSXk4ffRMBV+udvDLGTmr9DFZzUdU5eKMrGztgU1ccL+whbr3o1QL+3UI75Nj+guD51dXWvhH4e2rD4c1UvCwSuQoJLqo8XTp4p1cJ/yaN0se3sdRNls/oSN/wBekH1RCDBofCLc5yp5P2+IuwBzf86fDf/XO0Btc5epSsGV/4G1VLiuHHaClNSUlJSJi5PAdjKjFtMPpWeAAAAAElFTkSuQmCC>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFcAAAAZCAYAAABEmrJwAAAD+0lEQVR4Xu1YSWhUQRBNcAFF3HA0jpn5P5lxC4LGQREXAhpQUTwoejEnBdGLiIoiqEhyEVTcvWgUJIiioCcPxpMibpdENIkLilsSPWjcRbL4aqZ+rKnfPQmCudgPit/16nV3dU//7v6Tl+fg4ODg0OcoLCwc6XleM6wL9ry4uHiY1hAQ2wX7DPsOW6vjBLSVjMfjd7mt6zrel0D/sznfLuR0UMcJiF3kXBui0ehgHScgtgbWAmv3fX+vjltRUlIyEJWaBZXPnZUKjjpogNUK/yHsltSg4zKqK/xp0u9LoN/bsHfCb0Q+OwI/lUoNoNywkOJM9eNxjw00BPiXPDE/KNfAPkiNFRC2aS4Wi00B3xH4yWRyqGmSiEPCw5W/QWl+we5I7l8D/VXJfLEiR/HEXRWam7A3gc/cfj1O9vtrDuNcJDkjTBNSVFQ0VXaCcp3ulHlK+BSVE4nEaPLpKTVo+5qprgY0WzUngZzGaM4GzqtacshjkvRZc0JxtI3IN++QKXeu+0zzIUD0kcXd+yPKbVi984RPcVsnaR572m6TBvwZE68B3VzoHmqegFd3AmJvNW8CJmQh57WCfIxjmdbk/dkCdkoSP6DH/HLyvcxbF8qdNSHehKCjwNow0KVSYGtM8qhzxaI5buJNQBsLMDlPJIcBT0T9FsnlAupfoP7QVgXKe/AcAf+1bMPnswC2WdbF9hfhutvJl+OTsPFG4NeNBhXYHsm4rTHJI+EbJg34w8TjFjFOx0zAwMqhf0plnthWrckF6B9zXlmHDnNHuTyffPS1UWr4hyDdSVEnNCYbHwK/Rj+4XBZUhNUHGltjksfznEVzjPmsQyEXggmGvdexnoA696k/tLFO8d258jZDZ80mqREHX5WuI2HjQzCJkNgrydsak7xtzwVXbeJzAfrpsFbYCx3rCcEej7cxIXk1hvR10xdXMwIO4xjrVpOPZ7spd9WWGUhkpU3Enc/i8heTjjtppDLamkP+394WAniZiU3vj9gWZnq9OZUFoF/MeU1WPHF6wRhvCx7fdfGslXWEjjSdms8CBKWmygTJY+JWmXTEIZaSvscnreC+er28dHuZiZUfNOkJ9tUh1xM4rwrNyQlBuQPtPpAa1Nkmx4l4gW3csC2aD4GFlYqrhNUpjlbyeuHv0x3zKm0XVPD6+YIzgj9cXmqegNgMxJo0bwO0Zz3xERSJRIZwHgUBF89c/bLy57k4orhOaM8Lf4mulxMQf+KGm/hZozU47QdxgvfwrIf9BJ2vdRz75mU+G2kFlWuNCdAe0JwE+h+vuVxAe5d5LOn/TOjH05pgpfqZ6xvdaU9rDYFi9PZ4ma+6LvqxtMbBwcHBwcHBwcHhf8Bv7LGVw8GCqfoAAAAASUVORK5CYII=>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAZCAYAAABq35PiAAADV0lEQVR4Xu1XXYhNURSemUQiCWM092ff270PukUTDxJReFA8oOFFkp/Eg5ry5i95Ul4QD4q8yE8RXiiDBz/FkCg/JW/KT0lhRpquGd93ztrTuuvuc0zk7Xy1unt961tr7bPPOfvs29KSIUOGDP+IcrnsgGHLE6VS6QBjsF+wvTZO5PP5arFYfCS6WzaeBug3wz7A6uh1yMaJjo6OCYjdlPqPQbVaDYHYPtg32A/YFhsfFaRJ02KAuw1bovw9sK9ag0ku1rnwu0K1QoDuEuy98s/CvmgNFjrHevgdTz+Xy02V+m1aB+4VrFf5L2APtOaPkBUfCFxAG7hPhosWjhPUPmrsMJpB2EPNhSA9x1gO9ZYrfwD+RaN5Avvp/Wq1Oikwf19rsuWDwCrnIb6GpM+2GPhVliOkQYnjSqUynT5/tUYWuClXA5ojIQ052Fvt4xVcZzS7dS7Gz1JqnbJ8EL6ACywG31MpNlwoFCrkMKma1sHfb/OEPxPiNVz89DRpfE+OsZct4hj1FmoNFnIjeTyhU2yORhLfBIgu444WZNy0GMJf8QVhT2H9Oo5JXk3IOxHiNZImqnlcdI/4c7QGfdeSR3yezdFI4hsgm9Ad77uExSBcvBFFRWm4G7N8DJO5G8oDf1S0I3uLRdJENY/fgxzjCZltNKtFt97mGF2Qb4AVuITFADfAu8AxLvCNL97e3j5R4ucS8o4L37A5aiRNVPPovY1j9O7SGvDd5PG71OZoJPEjQOGTsJmac4HFcPFn7r7m+O5Kg5fiB/cMcKdDvAbi9ZBGX4DfM2DztQZ9N5D3T57O0UjiR4DgDdg9Y1GSjKPdl77fOE0+Dzb+zi3g+G++Joj3hjQyjyGO8ckcR38UX5PvKbVeWz4VkmSfDE6iW3PCb3Xm0wdbYzT9zhyeUGtnrVYb630s2Azbk5B6u4x/zGiu61wuVlItxOZaPhXSsKFYWgNzUXwK6krSSg34ktJEp1JbD/4Q+lxQ/oqApuEpEI617A1gz+3KP2zzUuHiz+VH2Dsxjnn2j4Dim6Qx73T0jnd2dk7TNQjwz118iuXxmndjmdWgVh/4lZaHfrAUb87R6+o3Z6M57+L/RvzlRfdYDY/rEuuT+fCEGvwPkyFDhgwZMmTI8L/xG+ukdx0gtoKTAAAAAElFTkSuQmCC>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAACdklEQVR4Xu2Wz6tMYRjHr+kmFCLlNs3MOfMjo0lKNlKKkmTllgUpN0mRpZKVnc39A1iIslI2VogNVlYWVkQpC9dCKUVchM9j3nd65rnve+bMoRllPvV2zvt9frzP+5x3zpmpqQn/IPV6fZ/VRskfrZ+m6SnGeauPkk6nszxJkg9WH0iz2awSuGD1cUAds4wnVs+EgJ90f4XVx4XUw3HaaPUgOO9kLFp9nFDPCcZnqwfB8du4z34IeQpWCyKOlUplpdUFNnYa+yWrl8vlVVyWWT0LYjaQ62qr1VrjNfLP1Gq1y9rPI3UxDli9j3a7vTq2UxI/qlaru7A/sEdMYrAf0loWFLqfmGvymtTruSKD66N/ZY17Vu8Dpz2RBCUWvSk3bpHeeSTp9khMFO9Pzus6lgaVY7nQnzNeW70PEh4PJUBPuUzLvdiZHvE25rdDMVkQv1uurhlPtS2WC/1uzNaDxHNZTnT7grW7It5oLQ+NRmOta8ZmraM91nNPrkaRbEeWE7YfMowmGzijtTwQc8WuxXxWftxa82B7xnhv9T7o8DqbVOOKvaHm25x/ifO7hQYc9jZ5Wv4+BHGv7Fp2rsH2hfz3rb4ESSL/QawuYPuuu5B0n4j/Qb5Q+i232Ttes2Cb1wVzf5G30lbtoxFf1jho9SW4hc9a3TGNbdH5vBWB64LM6fgx78R3ZD3aO11gCOmoyyXxe61dMyhXDxKdw/mj1YuQFPknGUCOpm9YLtxuf782i8JbZhN5jlq9CFIPm5ixepS0+6V8afVhSMzbqihJ9+P60OoDIWie43TS6kMw1H+jCCXq+GTF3PAk5qw2Sv7WEZww4X/gFx1cqoNOqunaAAAAAElFTkSuQmCC>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAaCAYAAABVX2cEAAABM0lEQVR4Xu2SO0pDYRCFk1Qp7YTAfTZZQMgGRKyiiIoGsoO0lmYB7sBWgl2C2Fm4AC3FB4KdCNYWdoLxm+vETCbXpAsI98AwM+ecmf+/j1KpQIElIUmSehiGJ3Ecr0hP3SAugiBoeu8ilFlyF0XRGjEiXogdEcifLD2dts8BAwNShaFNWUZOxxqHHAtn7POBuaf5xg/SDy1H3feeXOgjPuVwdtmu9+RChnisA88Rb6Z/xNO2nhnwNTf89ek7ekDVcJknTdOQ+pI4m0woIK/FyMtvKVXRft/5hGtwQEx9RZxb/deE/ky+l5r44B+rWQ9L9lQ7svwM1NTxvAX6g9xUfnDxez0DN9j6UzSwnnFNPpw4foh3vVmXU1enRAP0L1PfEq9Wz8DV1+Vr8s62acteL/CP8A2msVg1gQgYZwAAAABJRU5ErkJggg==>

[image20]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAaCAYAAAAJ1SQgAAAC9UlEQVR4Xu2WS2gUQRCGVyOiopggi7Cv2YeysB4MHkQ8KOYgIgZB8BwEBcGb4gMJ6DkHjR58gaBnD4IXH3c9+UAQPAiKHnxEJAgmGEXjX0v1pvaf6ZkxKOzqflBs11/V1dW9PbObyfT4j6hUKttZ61TK5fIga6nB5IOwE6x3MkEQzLKWSK1WK2LiW9Y7HfRcgU2yHoucEL7VJax3A+h9qlQqDbMeCZI3w2ZY7xYKhcLa1NcZid+77VllZLO5XG4Z6yEkEaezlHUH4jthV3Ag/eLjyuzF+DqGfZQ6L1BvF+wahousXq/XVzQajcVW8yF7gI2x3oYUjLsC8jzk8/lVsqjkoak7+BzCZrfGzUsL6p1CrRH55Hq6gatW84Ea94KkRxEJ23gRB/SbaGKd8WXxCTP+OZc9P1DjnX6+pD4Wio/1G0bzgrxLvn20wIns8yVBP0m+bHC/un/iCi9AvYoMpDZ6uewC8A9zX9lsdrn1Ldjscc4PIVcoMSnT/Ge1MSkvKe4Dtbfo3NYBwv9s61Wr1ZVBzE1C7Gji+tjspsSkTPPk7iblJcV9YN5Tnis+ervlfKx/Fv45m2NB/CLXCIGkAV8S9AnYax3Pwj64WLFYzLmfK421zOUoclVHSWtD5zWfXaVPtQ0m7uy9yWuhL85p1kNIkahXvBa/4H60Ya9sjHIfY/O7rab6J8lFM8c45kD8ma3n5lAOH2IbEsf646yH0I0cidAfaOy++pPa+JuI3Mhm8Dyu1+abN8QH4h91ra+waVsPm+gPYp5XQfsaYD2EnDqSv7D+O/g260D8NmsO3Jw11tdNHzL+Gdh5m2PB/4BC0vptaHLbP5i0YO4Q7LmOW1fdIT9v0hDrAvJnbKMYP+LG4f/ADVktfwflhWpjGpcbt4d1LyiyAxNesJ4WzP0Ge8K6EHheKoJsTA5LxvLGxXiKc6APQ3+IHk9zTA4hrr4XTBpD4QOs/22w7ijsRtS3loQcFmupwYIjrHUq8meEtR49evwb/ALGruM0cyAP5AAAAABJRU5ErkJggg==>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAaCAYAAACD+r1hAAAAp0lEQVR4XmNgGAWDCsjLy88C4mR0cTk5OWN0MZDiX0CKGUj/B2InJPEskBiSUgYGBQWFhUCKGargP5DvAJMD8j9gaAAK1ELpbnRJEB/opAXIYnAAdc5zJCGwE5WUlNSQxBAAqiEQxgc6rRDdRjhQVFQUR5cE8t/BxID0K2Q5MABJAjXqgdhA0zWgNj6Eyj1AUQwCQEUZUEWgkKqQkpLigvHR1Y6CIQgA0WYvFLiXQ58AAAAASUVORK5CYII=>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAZCAYAAADnstS2AAAAoElEQVR4XmNgGAV0BfLy8tVycnKxyGJA/nxkPhgAFf6G0v8VFRXtoOxkEF9BQaEBWeFcUVFRHphioKQ9ktxfdMW1IBooOAGkGC7BAHbGdGlpaRlkMTAAKQTiZ2hiL5H5YCAjIyMEUqykpCQHExMXF+cGipUgq4MBFnQnAPlvkfkoACj5B4gvAE3nB7r1JNA2FXQ1KADoSQMgjkAXHwX0BQCi+SKsRIoPhAAAAABJRU5ErkJggg==>

[image23]: <data:image/png;base64,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>

[image24]: <data:image/png;base64,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>

[image25]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJoAAAAaCAYAAABPT0XPAAAE50lEQVR4Xu2ZW4hVVRjHj5fSLhZl08Tc1plLjUxB6fQUUUq9BD34INVLYilUiAS+G/gm2kUqoSCEHkRCmOglygtUD93UiCjEFBNLAm1mvIWKpv6/fb51+PzP3mfvOfvs4w7WDxZ7r//3rb3+c9Y6a529plIJBAKBQCDQKvr7+11fX98Hzrn3h4aG7uD4jaKsvqrV6iPw9BHKm6jO5viNoqy+xNhmmLqKwXxR6hjYTtRPoVzg3HZSVl/w8wU8XMb1aanD17DUUf7k3HZSVl/CTBlIlJ84IGjsCuttoJS+uru752vf2zkmaOw460VTVl911MBZ1j34ZrwuObg+xbEiKaOvrq6uW6VPrLK/cMyD+Kfq6y6OFUVZfdVBx39J56xbYP4+HfQdHCuKEvv6L4OvF9TXao4VRVl9RaDjJ7XjPRxjNG+C9SIoqy+sBG9of+s4ZkH8Mc0b41gRlNVXHXR4STrG7UyOWTDwSyUP1084VgQl9iWD1HDVEKr68oLraxwrgrL6qpPVIL4xX6rB5zlWBP93X8j5V/Lk7ZhjRVBWXxGDg4P3qsHzHGOS/hBoCzHIP7Jeqb0tHmAxC3l9wc8G1cdjztqa9oVJ/Zw+N+t2PuXzwjOehb7Raj09Pd3QLmiblTaWhby+UB9T/TCqs7ye15dllj5kLwcsGLgFmrfV6vq7YAtPNMmTt0BpY/Vp0LQvV/uNEh1M6tlR3UNeX2j7uPa3iWMW+HpF8pC/3GsYtLuhrYX2g6OJhvp75n7a21oeX85MTty/bD+bvL6uQw02PIfSnNjBQefreaJ5ktpkoVlfqB9BuWxzZBWhnLy+vmPdojmxRzLw8rUzE21gYKDP+vE/BXw9K836Uu17Wx8eHp7XKl910Pi0fwAmzFzteDfKFo3LfWIHzU40xJ6B+QdZ9+T15ZEcOcRkzdYtiK3CdtvBukd9RO0xGA/g/iLKr7J9iYbrMdfgC8ITjUHsLMq+GL1QX0p0OM6ikORrWqjJHSgnjCb/3jmIchrVGSb9OmSiuYQtLsk0mKF9JsUj8vgSkLPNxfxHIalfbLUPp/nyJ+8YuDU2T9vJYByy+YxOtNgtDhNpTlzf7fAlIOcIxvND1pN8NQUe9I88TFYnXK+o6WU+LqfONt+jE20/60Ijc2j3GeJHWWea9dXb2/sQ2nzDupDiS/o5yboFv7ducXr8gvKVXqUs8jl4TtU0qaMT7S3WBfUV++Vpg6/lCG1mXWjkKzfo9Hd0sMTXXW0FmUK1NtGmrBqCGkxEPjzW0sjiC1vHncj72NexIjxh42m+nPmNlxV5ZkdHx+2+Xk34N5BOtLdZhzZp7uXtbwpF+ZIVE/qrcj8yMnKzrGA+lsVXLvDQP8Qkyjm54gMa5RxBJ9rPrAvSjjVLWjyODL5kW/4NvlbguhLl3Qod+qb16zJsM4x6qvvq7Oy8jXMEmWhVWjmQfwDaS1Jwvxpll417ivClb8Nj+nmtQvnctM3kKxc6gbzJbzkuuNrh34SrbW+yskTHCrg/jzKp+oR8uNRUnr8T2949rKeR5gvaGROPioml+oL+d6WJbUJXqqg/3L/DcUG9jWv/0dsfrot8O9N+TUzbQnxx31JUz+SrJeB3zqPyqst6K8A36X7WslKkL3mtZy0r+BIsHh0dvYn1VlBWX4FAIBAIBAKBQCCQyDU+unXMZ4wXSgAAAABJRU5ErkJggg==>

[image26]: <data:image/png;base64,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>

[image27]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIkAAAAaCAYAAACD1n8kAAAEnklEQVR4Xu2ZXYhVVRTHR0UqfdFML86de8+9MzfDF9EZI/woUMG31PGjIIkCSxHBzCQ/UJB8CGIeKh1BHM2PrAZffJjRiB6E8EHMF5EIsoQULBRTyBgER//Lu7b9Z5197pyGOZcG9g825+7/Xnvvtda9e+9zzm1oCAQCgUAgEAgkksvlxpdKpe+iKHqIcgHSKGuTRKFQeBF9rmvfXbZdaGxsHIe2y2pzpVgsNlubeoH5T6ofP4lftj0J2E+lGLpsO4P2M2p3F7FOtO0jjqamprwEhOszUs/n85Okjo+jjWkM2J1QW1fvQrlpbMoof1L9e01gB9tlTVtb21iZt7m5uajSGPVj6gBDD1hA6zgn+PwOSr8xe5I72L8k9XK5PEP7jWwQxD0E1W20H1H6WLNIsjXJ7ayrtoLrGP99j01dk4f5fkC5brSOFH6M1hg+Y1Fj2OvRPqD6gxTj//+RILAlvma0HYMFh/ZOscFx02h0SdRdUx8wVqRbPhK/nvUsUT/2G22u9c2C3KzSvm+wbuNCLEd9Y0GfYLX/whgMsB1OvGcb6gW2w1ckMPgwn3X49ZboOIKeZZ1B+1WxsUnwJG+pZyc5q/O+ynqGuKNlJ4uIP1J9OesMfPxC41zGOrR+jpPjliMcY7/wr/UQwMQfY8D78lluGuUzT1gvEPgmDa6Vdbd6Snq2+nDJS9hJasaSxmY4QRwzdc7NrFcqlcmiI5atrDNuwUSD7CSujnKrpaUFaSks0fp07pcKdFotnTH506Rd5AmTQJ/dsDueUI4h2CP65R1C6bIr2AKbj2ReucEyervoKKtZZ9xNWmRWoWqJsdAP8HXblhWYb6HMibk3si5PHurvQdYtavO5R4v9SCQvTpPvo1YuEtHBbni0v1mrBwhircwtK83oK0XHdRHrFtj0cBJg/7tLFtsRo3Tcd22DRZKN1Tg7TRlsa8dN9jSNcxPreAR+Tv3dw7oF/bZxTPjci9JntFjc7jhH/3Ws18Ql33ZSbTtr9cAFgTKHdfj5puhytrLuA34vhe3PKD0N+iRgk+XQtgVW9yH3C7Jlpywv2/6Gxz9Om2M5FtSnxB3TAZtZyMt5XM/JvZqN09ZVa1W9l/WaYJJv7UDuUVKe41n3oSv/k7TFrhwLzuSnZO7iEJ5ukpB+KF959H+Q3OddHV9sC7Q1bJMl6pf36SZK8a7Eov2umfqAnBWqLxpFj+UjERjvswOh/qXTcD3BbfVAg7Dn7Wnrp9xLYHXnWNO+Z1xdji3bT4D2G1btFKN1yo0ja1mC+R7Av0usIaYPrb/6xQ64kdc4/3J192KO84GxvrFjYb5louFaYr0m+iTzZCBMslgdcD+SWIKzJvLsGuoT35A+3q4T7I5TvR/5+JRt3O7pK2yXNfBjvp1T/bALJOabalepfluOHrZRXXbleVS/jfIH26RCbgadIygbRIv0mbvWe4kswdxfR9W3g3KN3eAJ8PsU2rawBrsDGscv2i/2NEWxxoq1zRq3c8DP7qj62uGwtYmqLwk7WYP92+rzr3r1/neD768SVfN4R+2uWJtAIBAIBAKBQCAQCAQCgUAgMEw8AoAd2bhr8DNqAAAAAElFTkSuQmCC>

[image28]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAWCAYAAADNX8xBAAAAdElEQVR4XmNgGAWjgDQgLy+/F12MLAA06B+6GFlATk7OBojL0MXJAkBXnVNQUDBHEZSVlTUhBwMNugU0cB+yQX7kYKAh10AYaAQLwlkkAqBrJgIN8UYXJwkADVAEGtSJLk4yABr0CV2MLAA06DC62CigIwAAJqAgbNKiql8AAAAASUVORK5CYII=>

[image29]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAWCAYAAADNX8xBAAAAtklEQVR4XmNgGAWjAAWwyMvLT0IXRAZA+b3oYhhAQUFhFboYOgAa9A1dDB0wAhU9QxdEB4qKiupycnJl6OJwADTkL7oYLgBUuxToenMUQaBAAlDiv6ysrAkpGKjnGhDvQzaoEmqQHykYatA1oBEsCGcxgJ37B0UADwBaPhGo3htdHAZAUX8XXRAdANUoAg3qRBdHAUBFW9DF0AFQzSd0MQygpaXFBozafnRxZAA06DC62CigIwAAs04ryWZGoL4AAAAASUVORK5CYII=>

[image30]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAAB1ElEQVR4Xu2Vu0sDQRDGk9gLolXuzOUuh2Bp5QsEa7FQOzWFrY9OBHtR7C2tbf0TRAtBSCnYSAQR1E4sxCA+vknmZB32LpuLCYj7g8Gbb2Z3Zs7LbiZjsVi6SVYKSXietwSrwT5hazLeNVB8mpvYkbE4kPtQKBQuFP8ZNq7mdBw0UObG12UsiWKxeEbrIh/Pc+Rjvy01r2OggW1ufF7GTOBmy0IbUX0t9C+CHeExx1IO/qqakwRyD2AfGGBMxkxB43s0gOM4/XCz8GdljhYUXeG3FtkMrCbzdCDvGPaKYoGMtQr2eaT62GsDtlwqlQZpb9i5zP0BEq6F/4YN+lRNBxXigSdkLA28Fw1wqshZ1hcULR4kVlzXdaSeBNZstlQkhmiAIAiGdLqqacHkt2EY9krdFBRZ5GKpzm2su9E1ajQAEp7wp0fqafB9f4oK4oXsylgS+C3u6xptOgCCLxotfoEh+BRDr3GbHspYDPXvHaeQq4o8QFXVvkHgzmvcdJR0D7ukZ3kWtwMdCNjzROo6kHdFfUQ+1k5SPxnd10FN0hHKLp377zxIqkvot0D9CvdRf7EmJ+L/hI5br3HpNbV2buiOkc/nB9DYqIlhiGG53mKxWP42X6HyjKKVj8cjAAAAAElFTkSuQmCC>

[image31]: <data:image/png;base64,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>

[image32]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAZCAYAAABOxhwiAAABO0lEQVR4Xu2VXUrDQBSF++KTVLRUAknMDwlkAdlNd6CiKHQZ3YcP3VVbCsWXCv6UVtBzZQLjUTuTBiPS+eDS4cydzBeSZjodh2PPiON4mCTJOedtgv2P4fHG+RfQdIdaS7OqC+75bfI8P42iaKI5mMV1/kpcpxVx9A440ynL8qAoii7n22hFPE1TD/0PnAue5x1ibs25iVbEhSAIQqx51DMlvdEzW5qIX3JuIsuyM6x7krGSfuUeW3YWx7/7inMbKvkm0kIT8WvObQjDsIf1G9QLz9VhZ3EcADecm6ikZez7fh/jZ+6xpYn4LefbwBM6qaQrlPzHO1+X2uJqM1k04rmfwIl3hP4V54K63qevjQ3W4mgao+5RM9RU/S5ii2+w6bWSw0dugPPvwH5L1Fw5SMl4yX0Oh8Ph+P+8A+VlbxirflOEAAAAAElFTkSuQmCC>

[image33]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAbCAYAAABFuB6DAAAAhUlEQVR4XmNgGAUDB+Tl5f9D8TIov1hOTs4GXdE7BQWFhUC6GoifQTXsR1GEDpSUlPiBim6ii6MAZWVlWaCiM+jiGADopkcqKip86OIoAGjSByDFjC6OAoCKvmER+48u8ASIP0F9+hyIr4DYQGfEwhWBOMBgSYRymYAK/kI1BMEVjQL6AwCI8iJjoqDbNwAAAABJRU5ErkJggg==>

[image34]: <data:image/png;base64,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>

[image35]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAZCAYAAAB3oa15AAACRElEQVR4Xu1WMWtTURgtRa2D4FADmjTv5YUgEsElxTYiRYfSrXR3Kp2qKFZCFyc3QZeCg+DQIUOG0llRrIOD+A+6t6SU0A4SSpuS6Dm8e+PXj/veKw6NhXfg8O4993z3ft+77yZ3aChFihQn4Pt+rVAoLGpdAp6XYJeEd0aPnzmQSAPsgL8NH2uPBcaOwQ9sl0qlEbR7KOKy9g0McQVA3wNbto/EV+gPguCu9A0UUQVACzhWLBY9qSP5O7I/cMQU8INjbJfL5Uue501rjwuIWcBOvcZz3fQfgfV8Pj8rfTxL0O/hOYFnFS/qKtrX4RvnS8J6lVN9qjEFUCcbmOgBJrzNPj8j7ZWA542I3ecOMhE/PEs94XsB1o2vB96A96aNRcznTCZzRc7thAl4EqFzoldWQxFFarlcbkx6NWxshL6ptHfGewEcRvtQjieCwUjsqUuPSaKpdYmYWO6CS2/74S509VgiTAHPXHrEYk5dIsoD7btLJ0zMV60ngoH4TJ5rHUX9dC0WlZxElAfakUvH+nPQv5hcJvV4LEzQktah3XItRg3FrWpdIqYA6v2DTJgD3jbj31xxkchms9fMpG/1GAH9AMl+En1eKRIXsAXg53BKaB+p4Qdg1GqY+77x9f8YTWz8QYZhDWyB2+CWee6CHYeX45yUVw++vWHt0TB+7uy8bYPNSqVyUXh++eG6TfCIGgp674d5UN8BN/7OeoawSWv93OBcF4DEa7YAfBLLp7oO/E9A4g/BKskrCO9R2pMiRYp/xx+rg9sfmM+VagAAAABJRU5ErkJggg==>

[image36]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE8AAAAaCAYAAAD2dwHCAAACyUlEQVR4Xu2YT6hMURzH38ufBfmT1NQ0M2eahqnJhqGElbIhsrAQGylEiJKFhahXpLwdq/fQk4UV0dvZ2niRlCJLIfXmRejh0fj83HP082tk3nvmzb3jfuvb+Z3f79xzfr/v3HPundvTMwk45w7BzdafNFDDymKx+MD624JCobCBxQ6waCPp4lHLaWq4NGPiBXSDeAKEO5uKN0V0Urwt1p80iHjUMWL9bYWIx5mx1fqTBi/eQ+tvK0S8fD6/zfqTBi/eI+tvK0Q8Ft5u/UmDF++x9bcFLLQOvod1z092TFIgucMxOCo14Zptx6ToZrB1zvDLX/8Dh3gwXYNXsQfhAOOP2zlSdANc9A73z2jnnynYPKZLO38swJbcT3IXWiXb9pidI/GgsIsIsYN2zMb+SyBEfzabnWf9iHSU2AQclr6MwX4rNu3476M7C/IZcdHWu2/88srV7/lRx3K53BLxwdelUmm5jv0ViLOPC3fLolY8ts0d4pvElrjcbTouPt3vJMhlVNlDcEL1v0qu8EbwCRBrEb662NR2csr1NBNPT4aQi03sHk2v9nUSkis5nvfdXp079uVga+D/zp23LPSr1epcHW8ZVjx+iSP+17oFX8lhr8b2BTuO4L/4GisevOKio2eW8jdkq9I+c9P54iITZTKZ+aEvL6wmgTpJrUDgpV7UnwzxOMFFZ/Su0OeOfKJiuiap4bDY1FvDfhNik4JMVKlUFoQ+k50zC9116lyJK8hxELF2Wn+A1CTnfLBtTPdbhlxYLpcXqv5GPRkL3nYx/zhAfnsRbq3Y5Lve+/rgZzWmAU8EO/ib9VuGXNjkoaDvvJdObYW4gSNltTww4B7/BvFc/PQPwmIYJzXVarU53n4RHhjS0v8SxrUELjgF37noc418evr1K/mD9wMcduYxHzeIKJYq9hT9btKOw1XmOql5AH7T/hQp4oUfZo0Y18JbRJQAAAAASUVORK5CYII=>

[image37]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEsAAAAZCAYAAAB5CNMWAAAC4klEQVR4Xu1XOYtUQRCeXVc8Ea9xZK43V6CJB5MZayQY7H8QDBTxQDTSTDTZRBbZQBQxMBFWEBSFNTAS0UgxE3HX9WJAxWt2Pb7Prdai5h0zb5JR+oOiXn/1dXd1vX7dM5mMh4eHRzqUy+Wa5f4HjARB0LYkUalUJhEbL5VKdTSHqtXqVhThJvhtVusA/VvYTxqaIzb+TwKLeeoWJQvrAPh7WiN2xeosUMyNMuZgFwtJ7rZcHKD/EFOsKSz8EPxl2BEbjwL6rB7oYiG5CdgcEt1kY3FIKNYduCHLJyGbza4cyGJxQbD39Xp9g411g4Ri3c6kKFYul1vBMZvN5mK2cc7tRHs7zrwt8DvIwY/ixR6Hv8B2o9FYwl0M7UnXT/oeo6ZYLDYc1yt4KD+BPccgy2ywF8QVC4negh1EvA1/kTosaJ/VWbhisQBs4/ku27DvsAnhjsJmhB/F+AfIw58mh8LCBVPk+LWQw0Wz5+8sCcDkq9DpNewBmsM2ngZBTLGQ5HXYKdVeSi13ipJ1wBXLvUg8P4TttzruFuow7lXNSwF/hHAtzYUCgxYg/MTkbaxfxBUrDJJ0rN4VS/x01I7AeirUcRdpXuYYD+Fi5/0N2YbzeKPnbaxfxBVLnx0O3STtigVrw+ai9IVCociYPW+l79kQLnScUKgdNmljaRFEFKtWq5UlwRua7yZp8xnyfGWfa1Yn66FurebJYY1nLJc0byjkap7BgPczKW4rjSCiWPy7Qh5+l+Yl6XnNWaDPGj0mng+zzRegde4zzOfz6zUvc/S3s0KwCAM8gj3j4WuD3QB9P0clIfyfiwRznCCXNBf/HkkRljvOLVZzKGpT+M2Oc1rMcclyUXn2DH6aGKyFc2CdjYUB2o+wWdgLMV7jLfkf6DAcqHOHxl2t4h2A5gvspYxJ/zhY2FmvhJtFkcbgvxrdN9g5pZsOFn4/luDfKO6dnTM1kMhey3l4eHh4eHh4eHTgF5YVDRxzknSZAAAAAElFTkSuQmCC>

[image38]: <data:image/png;base64,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>

[image39]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAaCAYAAABVX2cEAAABB0lEQVR4Xu2SPQrCQBCF408jiF26/LPYWNh4A2/gNSy8hI14B7GysLGwsBDtPYKNJzCiCCJi0De4C5txk8ZKyAdDdt97TGaXtayCn/B9f4K6ol5UnudNDZlE+TLT5ZkUeph7BPSt4ziC6yZKCK9QC9mwxwNZP/kCYw9c1+3QOms6aE+uGUEw1tZnaiaEaCgtiqJmEAQjtc9Fn4TuRU631/yZbdt1tc+D7mupC/yopmMb0e9L12TDMe3xfeh+JgieuEao6dC4he+Q+0ayjgB9LRsecI817puoIrzhoqSspuOGiQqCRxxjxw0F/BvqzvUUeDNzhC6o2P+8q4RniDAM2/D6XC8o+GveCaFOc4oEKrMAAAAASUVORK5CYII=>