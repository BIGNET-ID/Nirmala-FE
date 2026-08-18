# **Product Requirement Document (PRD): Nirmala Platform**

**Dokumen Status:** Final Technical PRD v1.1

**Tanggal:** 14 Agustus 2026

**Target Platform:** Web (Next.js App Router, Material UI v5, Canvas API, Web Worker, Google Maps JS API, Kafka Stream Proxy)

**Tipe Dokumen:** Product Requirement Document (PRD) & Technical Specification Bridge

## **1\. Executive Summary & Visi Produk**

### **1.1 Visi Produk**

**Nirmala** adalah platform pemantauan telemetri cuaca dan geospasial real-time berbasis web interaktif (*Ventusky-like radar*). Platform ini menyajikan data lebih dari 4.500+ stasiun sensor (curah hujan, suhu, kelembapan), vektor angin, pergerakan sel badai (*thunderstorm cells*), serta kejadian sambaran petir secara langsung (*live lightning strikes*) dalam bentuk visualisasi *heat field continuous* yang mulus (60 FPS) tanpa membebani *Main Thread* browser.

### **1.2 Tujuan Utama (Primary Goals)**

1. **High Performance Geospatial Rendering**: Menghasilkan pemetaan *interpolation heatmap* dan simulasi partikel angin pada kecepatan **60 FPS** secara stabil saat interaksi *pan/zoom*.  
2. **Real-Time IoT & Kafka Pipeline Integration**: Mampu mengonsumsi *stream* data telemetri dari infrastruktur Rainvision Kafka Pipeline via REST/SSE dengan mekanisme *ring buffer* dan *throttling*.  
3. **Multi-Layer Phenomena Visualization**: Menyajikan layer komprehensif yang mencakup Curah Hujan (IDW), Suhu Udara, Simulasi Vektor Angin (Lagrangian), Sel Badai Petir (GeoJSON Polygon), dan Sambaran Petir Real-time.  
4. **Hydration-Safe Security**: Menjamin keamanan sesi pengguna secara *client-side* menggunakan enkripsi AES crypto-js yang kompatibel dengan Next.js Server-Side Rendering (SSR).  
5. **Multi-Tier Adaptive Scaling**: Mampu menyajikan visualisasi makro (skala nasional) hingga mikro (stasiun lokal) memanfaatkan *Dynamic Sampling Step*, *Spatial Clustering QuadTree*, dan *IndexedDB Tile Cache*.

## **2\. Problem Statement & Solution Overview**

| Masalah Utama (Pain Point) | Solusi Arsitektur Nirmala Platform |
| :---- | :---- |
| **UI Freeze (0 FPS)** saat menghitung interpolasi IDW ribuan piksel data sensor secara kontinu pada Main Thread. | **Multi-threaded Web Worker**: Pengolahan matematika IDW dan pemetaan RGBA dipindahkan ke idwWorker.worker.js dengan pengiriman *Transferable Objects* (ArrayBuffer / zero memory copy). |
| **Render Bottleneck & Lag** akibat *state update* React berlebihan saat ribuan data sensor masuk simultan dari Kafka/SSE. | **Batching Buffer \+ RequestAnimationFrame (RAF)**: Implementasi useSensorStream hook menggunakan *Ring Buffer Queue* dan mem-flush state maksimal 1 kali per 200 ms. |
| **Hydration Mismatch Error** di Next.js App Router saat mengakses localStorage pada Server-Side Rendering (SSR). | **Safe Crypto Storage Wrapper**: Isolasi pengaksesan localStorage dengan penjelajah objek typeof window \=== 'undefined' serta enkripsi AES (crypto-js). |
| **Penurunan Kinerja pada Zoom Level Makro** (Skala Nasional) akibat pemrosesan ribuan titik acuan ![][image1] di seluruh Indonesia. | **Adaptive LoD & QuadTree Indexing**: Penyesuaian *step size* otomatis (2px s.d. 8px) dan pengelompokan sensor berdekatan menjadi *Centroid Node* berbobot. |

## **3\. User Personas & Target Audience**

1. **Operator Command Center / BMKG / BPBD**:  
   * *Kebutuhan*: Pemantauan cuaca ekstrem real-time, intensitas hujan, pendaran petir, serta pergerakan arah badai untuk peringatan dini bencana.  
2. **Pengelola & Teknisi Stasiun Sensor IoT**:  
   * *Kebutuhan*: Pemantauan kesehatan stasiun sensor, identifikasi node yang mengalami *blacklist* / inaktif, serta analisis tren histori 24 jam.  
3. **Masyarakat Umum & Otoritatif Lapangan**:  
   * *Kebutuhan*: Peta indikator cuaca interaktif yang cepat, intuitif, dan responsif di berbagai perangkat.

## **4\. Functional Requirements & Feature Breakdown**

### **4.1 Interactive Geospatial Radar View**

* **Google Maps Overlay Canvas Bridge**:  
  * Mengintegrasikan google.maps.OverlayView untuk menautkan HTML5 Canvas tepat di atas layer peta geografis.  
  * Tampilan dasar *Dark Futuristic Glass Theme*.  
  * Fitur *Zoom*, *Pan*, *Tilt*, dan penyesuaian proyeksi geografis ke piksel layar (fromLatLngToDivPixel).  
* **Interactive Station Markers**:  
  * Tampilan titik lokasi stasiun sensor dengan efek *pulsing glow animation*.  
  * Filter visual untuk menampilkan/menyembunyikan stasiun berstatus *active*, *inactive*, atau *blacklisted*.

### **4.2 Interpolation Heatmap Engine (Ventusky-like IDW)**

* **Mathematical Field Interpolation**:  
  * Perhitungan kontinum nilai metrik ![][image2] pada piksel ![][image3] menggunakan formulasi *Inverse Distance Weighting* (IDW):  
    ![][image4]  
  * Parameter daya ![][image5]. Apabila jarak piksel terhadap lokasi stasiun ![][image6], digunakan nilai eksak ![][image7] (*exact match*).  
* **Worker Offloading**:  
  * Komputasi IDW diisolasi pada Web Worker thread.  
  * Hasil perhitungan ditransfer dalam bentuk ArrayBuffer berukuran width \* height \* 4 menggunakan *Transferable Objects*.

### **4.3 Wind Flow Vector Particle System**

* **Lagrangian Particle System**:  
  * Animasi hingga 2.500+ partikel bergerak yang menggambarkan lintasan arah dan kecepatan angin.  
  * Pembaruan posisi partikel ![][image8] berdasarkan komponen kecepatan horisontal ![][image9] dan vertikal ![][image10]:  
    ![][image11]  
  * Menggunakan **Interpolasi Bilinear** untuk menghitung vektor angin di antara 4 titik grid terdekat.  
* **Trail & Glowing Effect**:  
  * Pembersihan Canvas menggunakan teknik *destination-in semi-transparent fade* (rgba(5, 8, 17, 0.92)) dan mode komposit lighter untuk menciptakan efek jejak pendaran angin.

### **4.4 Real-Time Telemetry Stream & Batching**

* **Stream & Buffer Architecture**:  
  * Mengonsumsi stream SSE / API telemetri secara berkelanjutan.  
  * Penggunaan *Ring Buffer* pada useSensorStream hook agar pembaruan data tidak langsung memicu *re-render* React secara berlebihan.  
  * *Batching flush* dilakukan maksimal setiap 200ms melalui requestAnimationFrame.

### **4.5 Special Phenomena Layers (Lightning & Thunderstorm)**

* **Real-Time Lightning Strikes Layer**:  
  * Menampilkan titik kejadian petir (*cloud-to-ground* / *cloud-to-cloud*).  
  * Efek visual pendaran kilatan (*glowing pulse*) dengan radius yang dikalkulasi berdasarkan *signal strength* (![][image12]).  
* **Thunderstorm Cells Layer**:  
  * Visualisasi poligon sel badai berbasis GeoJSON Polygon dan Centroid.  
  * Penentuan warna batas poligon: Merah Pejak (\#ef4444) untuk kategori *severe*, dan Ungu Radar (\#a855f7) untuk kategori standar.

### **4.6 Forecast Timeline Controller**

* **24-Hour Slider Control**:  
  * Slider proyeksi temporal waktu (00:00 \- 24:00 WIB) dengan fitur *Play/Pause*.  
  * *Auto-increment step* setiap 800 ms untuk mensimulasikan dinamika pergerakan cuaca harian.

### **4.7 Secure Authentication & Session Persistence**

* **Crypto Utility Wrapper**:  
  * Penyimpanan token/sesi terenkripsi AES (crypto-js) di localStorage.  
  * Aman dari krisis *SSR Hydration Mismatch* pada Next.js App Router.

## **5\. Non-Functional Requirements (NFRs)**

### **5.1 Performance & Rendering Standards**

* **Target Frame Rate**: Stabil pada **60 FPS** saat interaksi drag, zoom, dan playback animasi angin.  
* **Zero Memory Copy**: Pengiriman buffer warna RGBA antar-thread memanfaatkan mekanisme *Transferable Objects* (postMessage(payload, \[buffer\])).  
* **Memory Leak Prevention**: Penghentian otomatis animasi cancelAnimationFrame, pembersihan EventSource SSE, serta *termination* Web Worker saat unmount komponen UI.

### **5.2 Multi-Tier Optimization & Dynamic LoD**

* **Dynamic Step Size Matrix**:  
  * Zoom Level ![][image13]: Step Size ![][image14] px (Downsampling 4x lipat kecepatan pemrosesan IDW).  
  * Zoom Level ![][image15]: Step Size ![][image16] px.  
  * Zoom Level ![][image17]: Step Size ![][image18] px (Detail maksimal).  
* **Spatial Clustering (QuadTree)**:  
  * Pengelompokan titik stasiun yang berdekatan pada skala nasional menjadi *Centroid Node* berbobot untuk mereduksi jumlah titik acuan IDW.  
* **IndexedDB Tile Caching**:  
  * Penyimpanan *cache tile* hasil render di IndexedDB (NirmalaTileCacheDB) dengan Time-To-Live (TTL) selama 5 menit.

### **5.3 Security & Data Integrity**

* Enkripsi data lokal menggunakan kunci AES rahasia (NEXT\_PUBLIC\_CRYPTO\_SECRET).  
* Proteksi rute navigasi dashboard menggunakan AuthGuard.jsx dan pengecekan permission berbasis API manifest.

### **5.4 UI/UX Design System**

* **Theme**: Dark Futuristic Glassmorphism berbasis Material UI (MUI v5).  
* **Color Palette**:  
  * Background Default: \#050811  
  * Paper Overlay: rgba(15, 23, 42, 0.82) dengan backdrop-filter: blur(16px)  
  * Primary Accent: \#00e5ff (Cyan Glow)  
  * Secondary Accent: \#ff4081 (Pink Magenta)  
  * Typografi: Font Family *Inter* / Sans-serif.

## **6\. Frontend Architecture & Directory Structure**

Aplikasi dibangun menggunakan Next.js App Router dengan arsitektur folder modular berikut:

nirmala/  
├── src/  
│   ├── app/  
│   │   ├── (auth)/  
│   │   │   └── login/  
│   │   │       └── page.jsx  
│   │   ├── (dashboard)/  
│   │   │   ├── page.jsx               \# Interactive Ventusky Radar Dashboard  
│   │   │   └── sensors/  
│   │   │       └── page.jsx           \# Sensor Node Management  
│   │   ├── api/                       \# Next.js Route Handlers / API Proxy  
│   │   ├── layout.jsx                 \# Root Layout  
│   │   └── providers.jsx              \# MUI Theme, Query Client, Auth Provider  
│   ├── components/  
│   │   ├── common/  
│   │   │   ├── AppIcon.jsx            \# Dynamic Iconify Wrapper  
│   │   │   ├── GlassCard.jsx          \# Glassmorphism Container  
│   │   │   └── LoadingOverlay.jsx  
│   │   ├── auth/  
│   │   │   └── AuthGuard.jsx  
│   │   ├── map/  
│   │   │   ├── GoogleMapWrapper.jsx   \# Google Maps Loader  
│   │   │   ├── CanvasOverlay.jsx      \# Google Maps OverlayView \+ IDW Canvas Bridge  
│   │   │   ├── WindFlowLayer.jsx      \# Lagrangian Wind Particle System  
│   │   │   ├── SensorMarker.jsx       \# Station Markers  
│   │   │   └── MapControls.jsx        \# Map Controls (Zoom/Pan/Tilt)  
│   │   └── dashboard/  
│   │       ├── HeaderNavbar.jsx  
│   │       ├── MetricLayerSelector.jsx\# Layer Switching (Hujan, Suhu, Badai, Petir)  
│   │       ├── TimelinePlayer.jsx     \# 24-Hour Forecast Timeline Controller  
│   │       ├── ColorRampLegend.jsx    \# Dynamic Scale Legend  
│   │       └── SensorDetailDrawer.jsx \# Telemetry Inspector Drawer  
│   ├── context/  
│   │   └── AuthContext.jsx            \# Encrypted Auth Session Context  
│   ├── hooks/  
│   │   ├── useAuth.js  
│   │   ├── useSensorStream.js         \# SSE Stream & Ring Buffer Batching Hook  
│   │   └── useMapInterpolation.js     \# Web Worker Canvas IDW Hook  
│   ├── workers/  
│   │   └── idwWorker.worker.js        \# Web Worker IDW Engine Thread  
│   ├── lib/  
│   │   ├── crypto.js                  \# Safe CryptoJS AES Storage Utility  
│   │   ├── tileCache.js               \# IndexedDB Tile Cache Utility  
│   │   ├── theme.js                   \# MUI Dark Glass Theme  
│   │   ├── axios.js                   \# Network Axios Instance  
│   │   └── algorithms/  
│   │       ├── colorScales.js         \# HSL & RGBA Color Ramp  
│   │       ├── quadTree.js            \# Spatial Indexing Clustering  
│   │       └── vectorInterpolation.js \# Bilinear Wind Interpolation  
│   ├── types/  
│   └── constants/  
│       ├── mapConfig.js               \# Default Bounds Indonesia  
│       └── metrics.js                 \# Scale Threshold Metrik Hujan & Suhu  
└── package.json

## **7\. Technical API Contract & Data Schema (Kafka Pipeline Backend)**

Backend Nirmala terhubung ke **Rainvision Kafka Pipeline** (http://172.18.188.154:8000).

### **7.1 API Endpoint Matrix**

| Method | Endpoint Path | Deskripsi & Kegunaan UI | Frekuensi Refresh |
| :---- | :---- | :---- | :---- |
| **GET** | /api/sensors | Mengambil data 4.500+ stasiun sensor (koordinat, status, status hujan). | Every 30s / SSE Stream |
| **GET** | /api/lightning | Real-time events sambaran petir (![][image19], cloud/ground, lat/long). | Every 10s |
| **GET** | /api/thunderstorm | GeoJSON Poligon sel badai petir & centroid koordinat. | Every 30s |
| **GET** | /api/manifest | Metadata platform, akun permissions, default koordinat map, & statistik Kafka. | On App Load |
| **GET** | /api/health | Diagnostik kesehatan pipeline Kafka (uptime, consumed messages, state counts). | Every 60s |
| **GET** | /api/topics | Daftar Kafka topics aktif yang dikonsumsi pipeline. | Developer Panel |
| **GET** | /api/raw/{topic} | Preview pesan Kafka raw mentah (contoh: rainvision.sensors). | Developer Panel |

### **7.2 Detailed Response Payload Schemas**

#### **1\. Sensor Telemetry (GET /api/sensors)**

{  
  "scraped\_at\_utc": "2026-08-14T06:05:31Z",  
  "bounds": { "north": 6.5, "south": \-11.5, "east": 141.5, "west": 94.5 },  
  "filters": { "active": true, "bignet": true, "inactive": true, "blacklisted": true },  
  "total\_items": 4582,  
  "alert": "Live: 4582 sensor · 4506 aktif · 71 hujan · 76 blacklist",  
  "sensors": \[  
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

#### **2\. Lightning Events (GET /api/lightning)**

{  
  "request\_time": "2026-08-14 14:20 (UTC)",  
  "content": \[  
    {  
      "long": 120.1242,  
      "lat": 14.362,  
      "cloud": false,  
      "signalStrengthKA": \-95.5,  
      "time": "2026-08-14 14:10 (UTC)",  
      "\_type": "lightning"  
    }  
  \]  
}

#### **3\. Thunderstorm Cells (GET /api/thunderstorm)**

{  
  "request\_time": "2026-08-14 14:00 (UTC)",  
  "content": \[  
    {  
      "stormId": 300762257,  
      "referenceTime": "2026-08-14 14:00 (UTC)",  
      "severe": true,  
      "centroid": { "type": "Point", "coordinates": \[125.97842, 20.50554\] },  
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
      "\_type": "thunderstorm"  
    }  
  \]  
}

## **8\. System Context & Data Flow Diagram**

\+-----------------------------------------------------------------------------------+  
|                                 CLIENT BROWSER (Next.js)                          |  
|                                                                                   |  
|  \+-----------------------------------------------------------------------------+  |  
|  |                           React UI Components Layer                         |  |  
|  |  \- Dashboard View, Timeline Player, Metric Selector, Sensor Drawer          |  |  
|  \+-----------------------------------------------------------------------------+  |  
|          |                                   |                                    |  
|          | (SSE Data Stream)                 | (Render Visual Overlay)            |  
|          v                                   v                                    |  
|  \+-----------------------+           \+-----------------------------------------+  |  
|  |   useSensorStream     |           | Google Maps OverlayView                 |  |  
|  | (Ring Buffer & Throt) |           | \- Canvas Heatmap / Wind Flow / Lightning|  |  
|  \+-----------------------+           \+-----------------------------------------+  |  
|                                                      |                            |  
|                                                      | postMessage()              |  
|                                                      v                            |  
|                                      \+-----------------------------------------+  |  
|                                      |            WEB WORKER THREAD            |  |  
|                                      | \- IDW Spatial Matrix Computation        |  |  
|                                      | \- HSL to RGBA Color Scale Engine        |  |  
|                                      \+-----------------------------------------+  |  
|                                                      |                            |  
|                                                      | Transferable ArrayBuffer   |  
|                                                      v                            |  
|                                      \+-----------------------------------------+  |  
|                                      |       IndexedDB Tile Cache Store        |  |  
|                                      \+-----------------------------------------+  |  
\+-----------------------------------------------------------------------------------+  
                                       ^  
                                       | REST / SSE (http://172.18.188.154:8000)  
\+-----------------------------------------------------------------------------------+  
|                            RAINVISION KAFKA PIPELINE                              |  
|  Kafka Topics: sensors · lightning · thunderstorm · rain · signal                  |  
\+-----------------------------------------------------------------------------------+

## **9\. Key Performance Indicators (KPIs) & Acceptance Criteria**

| Kategori Ukur | Parameter Metrics | Target Kinerja | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| **FPS Performance** | Main Thread Frame Rate | ![][image20] FPS | Peta di-drag/zoom tanpa stuttering/lagging pada resolusi layar 1080p. |
| **Stream Latency** | Telemetry Update Latency | ![][image21] ms | Data baru dari SSE/Kafka masuk ke ring buffer dan memperbarui canvas tepat waktu. |
| **Memory Leak** | Browser Memory Heap | ![][image22] MB | Alokasi RAM stabil setelah 1 jam navigasi tanpa akumulasi memory leak. |
| **Hydration Health** | Next.js Console Errors | 0 Error | Bebas Mismatch Error saat refresh halaman yang mengakses secureStorage. |
| **API Response Time** | Latency GET /api/sensors | ![][image22] ms | Memuat 4.500+ data sensor tanpa memicu request timeout. |

## **10\. Development Roadmap & Implementation Phasing**

\[ Phase 1: Core Foundation & Map Overlay \]  
  ├── Setup Next.js App Router & MUI Dark Glassmorphism Theme  
  ├── Implement Safe Crypto LocalStorage Wrapper & Auth Context  
  └── Integrate Google Maps JS API OverlayView Bridge

\[ Phase 2: High-Performance Engine Development \]  
  ├── Build Web Worker IDW Interpolation Engine (Zero Memory Copy)  
  ├── Build Wind Flow Vector Particle System (Lagrangian Bilinear)  
  └── Implement Special Layers (Lightning Glow & Thunderstorm Polygons)

\[ Phase 3: Telemetry Stream & Multi-Tier Optimization \]  
  ├── Integrate Kafka Pipeline API (Axios \+ SSE Stream)  
  ├── Implement Ring Buffer Queue & Throttled RAF Flush Hook  
  ├── Implement QuadTree Spatial Clustering  
  └── Integrate IndexedDB Tile Cache Utility

\[ Phase 4: Hardening & Production Deployment \]  
  ├── Profiling Frame Rate via Chrome DevTools Performance Profiler  
  ├── Handle Edge Cases (Network Reconnect, Sensor Node Drop)  
  └── Deployment & Production Hardening  


[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAAWCAYAAAAmaHdCAAAA5UlEQVR4XmNgGAV4gby8/Dwg/gzE/0FYTk5uARY1f2HyUDXO6GrAAFkRuhwIAMX3ycjIqKCLIwNGoKLtQLwealAQugJchsMB0Hn5srKyJiA2LtcAxf6gi6EAoIK3SOwPIENUVFT4YGJKSkpqCgoKnTA+VoBsM8jfUNfcRJJfJioqygPjYwOg8NiMLIDuJWzeQwHA8NgApJiRxUBegRr0DsQH0keQ5TEALltgrgHiHJzpAgaAir6ii4EAMLb80L2FFYBsACpqRheHAbyGAKMrA+QCJCdfR1cDAkDx2UC8H118FAx2AAABt0kfexs6agAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAaCAYAAADFTB7LAAACOElEQVR4Xu2VvWsUQRjGg4lgIimsDs7j9u6KXCBEkQMJJkWwSJHKkEY70UbSBG0ShRRCOm0lIY2aFCH/gIVgFT+aFOlsDSkEQbGxUDHx925mYPJk17u9WzDF/WCYeZ/3nWfnY/eup6fLfyaKolnVWqFSqQyrljssbrNcLk+o3grM3SmVSqOq5wYPmOYUXqueBTwOC4XCedVzwcxVy0q1Wp3C54fqHYPpI9qu6u1gG+WqL6reEWbK9Y6p3g72LtLeqn4CitZod1XnI2io1ux6yS8xb8HHbOYh2tOwxkPuZjM/M/xF12uFtOuBPqeTiadVCzCPrzbg/brs/H4Wi8UB+nXajk4w/uEX7+AlXa+NrZB40ueIv+tk8o9V86AfSHzISc4zPOPGq2Hek+YXQ3LJ9U+00Jm+CDXbkNZ5yN3wY07walhH7pwfK+5gUvMxVkT7HEjxlddqtaFAs3fyedoCQ6h51UqdYXX1en1Q9WO4Bc74mB3dT3oA+mKSrji/fdWTaOrHdRS0iPib1+i/BPqM1nrcou4E47kg9yztXyPN7xhWxEIv2ZhTGnYP2HO5T1obxgZzbpnOKzBCW7Ex2m3LEV8g/ihTYtBnk/xOgNk9tygzXnQ/DXGstW4hSb+Pv92cB/w79NMfuHhDaz3k3tM+qN4R0dEH8E71drANNBqNs6p3TNLJZoVbGI+O/iTyB+NlXoUt1bOAxx+6PtVzgwds+w8rK8x9Q7uieu7Yx6VaK7C4a6p16XIa+QuZNp/l6kHCAQAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAaCAYAAACD+r1hAAAAsUlEQVR4XmNgGAWDDigoKEyUk5NLReJ3yMvL1yCrAQNFRUVxoOQlEBuoIReo6BcQ/wfxgfRZIO5B0QCTBAFRUVEeEB9oiD7QEAsQG0hHIKsHaTCCsYE2lCEbAFTMAWNjBUDFn5A1EAQgxUC8GF0cDoBWCoAUycrKKsPcD3SWFkweyL+KrB6kYSZIkYyMDCeQPge1QREkB/I4UPMKFA1AwAhVBDLZFWQTEr8OXfEoGKIAAEV2LWbH2wyUAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,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>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAABs0lEQVR4Xu2WzytEURTHZ0bK0k4xM2/GxoLdy16IDZJEmp0df4CVrZK9LMiPscPCRuIfoGRDUnZSig0LZUHxOePMdOfMTLGY5029T53evd/zve457ruvicUiIiJCSSaTOfU874t4IWZtPtRI4b7vN8uYRma0kWfrCyUUepxOpw+NdiRNpFKpMVcPJRT6KcXSxGRRY9ytp/Dkektks9kuTGscV6vMGfvyX6DjXuutN8lksoNC865GXX3awKWrF4ljuCLZr6Z7YkISPD9oZLvcHjzUcKKvUI/NSZH7PBKYRvXoOos5GlsWzbFXQH63RuRZv8Pf22K8SWwQ63b9L2iSGogLmyhAYlGf52I0uQOrBQ37v3s1Xp0ytMvbKtq/NcDeN5zintWrIoVinrYa8ehqFvIrfwm7vhbez+kvGe3BnZfgKzTkVb4+OdFoqsXVg4B7s8C+c65GjW3Us+pqJUicSbEsHFEpofOpMmMAsOeA7F0taGrY+gto8o7ntZrf+GS1W18Q2KLdIJ2w/gJqyFm9IZDfF9pdY0Lxr3oC83JRbD70cGkG5SvEHRhnGrf5iIiIiLryDehvj8ZWHzoTAAAAAElFTkSuQmCC>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHcAAAAaCAYAAACNU8MOAAAEnklEQVR4Xu2ZXYhVVRTHZ3TwAwm/iFFn7j1n7r1xaSA/H2wkI/BFfNMxB5OQwD4oQg0RSx90sEIUgrTorXFQB31RXyx6qAeRCBViQBh8iDRKCYOBHDW//2vu2s7y77nHfc7c8pLnB5uz93+tvfY6e599Pu5taMjIyHjKCIKgk7U6oam1tXUaixlEGIYzWlpaWlnHwvbl8/mXWK8XkN9guVx+hvWMhuFF3Y8JuqflA2tDexns31mtHpHcWXuSYM6mJM2publ5ksy1rsNpSI3skwoEe16TaSI9UYJPCtxZPkGuZ1j/LymVSs8ij4tmo3jPHR4tLeKP40Rp4w46XfuPIdfk4Io5zMmg/RHKz1arZzT/2lztIzTKRLP4OJIuLnyHZA1IO4Nyw2qp0GSGWMOAL1qtnkG+d1B2sp4GeUlDrD9RfmCbDykW9x52/SrSZHN5x3gIdNyD0q11SWYb2WMDw74Oi7+rvb19nLbfRfmS/XxAv3kohwqFQl7bi1D65NnFvtXA5HyFPrdZT0JbW1sZMW6iHGRbEnQ+Y+fPgTFfFl9+acW5rxU90dcAOn0oJyB1dHzOJYJnxnjng/ayuOR0EpuQ0FTt/wvihmi/rzZv0O088nhB6hqrF9oGiReXAxNULghvfwuGekXH3s22NGgsr1zkXNV/vtUxl6+KDvtCq1cFHd7UDhOchno/JwJtB2sO6L/b/prYUVMfGPGOB/msR6y3XVv7D49r6z4gzowk/gL6rJY+OG5k22hIkjv8usUXO3g26cs1zhqrV0WdL0Vo160W6ueR1RyyIKY5Vvyw80rSsIvuA/puorbkcsBqFrl1YYzjrDuq5cyEultw7GJbLdDz8MoF5/SW5jKX9JWi47jE6pGg81IN8mCnCKpttxoCfu2THPw2+/h50iSxcrlckQ0OjLcA9lmsO3xzgd/HOtZittWCJIvrnrkoHVbHub4uunwmWT0SOB7iAWXHicY7Du0t7BsFfK76+PkQVt4FUsfCJDUn7e92cJ7eVEdLksWVd52oHIIkb8tw3MfOaB9wWmDeEAO93494jgD9Bkqv1uXCOOJs8hIQPvz51BjQW7gFtnNm/H94TMT71tVhuxLEvKzJuNzfF/fyQo+c1EisarnInQe25VZT/89JO1EtxiPIz1vWGfVOmwQH4rZqM7XPa5jMLqljQnrUPAbtq+T/l/pstrpDY52VX2a0ftfY/nZ19P/M+TuNgW1vnN0H9O+QHDDep2xLgp5LZC5RtiBil6rfCqvFIg9nFxzlPdFwvCtt/p4STZ5xVlP9stp6tD2841B+JFe5Vc4JKgt8gW0C9C+076/SxgVzXttD7qc4R77y2XXHahbYbo12URzII0S8a+bC9QJ9BlH+QPlNi9QHrY888hD3mNUE+PXJ+elR7ogb2KdmBJXbwinW04A437CWFEzITzjh1aw7ZEJYGy0Yb0LUP2X/C2oxYZigN2oxQS4XHL+PsG3FOP2sZ8SASdsZ0g/aSUGMy6ylAXEGAr19M7W4CJ9KMHEn+deTegL5XSoUCpNZz/AEu/cd1uoBeekqFos51jMyMjIyMjIy/g3uA6uQhdPi3umdAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAaCAYAAAC6nQw6AAAA9ElEQVR4XmNgGAWjgIpAXl5+FhAno4vLyckZo4vhBEADfgEpZiD9H4idkMSzQGJISnEDBQWFhUCKGcQGaQLyHWByQP4Hog0CKqyF0t3omkB8oNcWIIuBAFDspIqKCh+6OBhAvfUcSQjsVSUlJTUkMTAAireii8EB1KBAGB/oxUJ0FxIEioqK4uiagPx3MDEg/QqqDsiU3wfEc5HVogCQJqBCPRAb6BoNqAsfQuUeQOnbMjIyQkD6L5JWVADUnAHVDIq5CikpKS4YH1kdKKCB8hHIYmQBdIPJAqA0BvKeuro6L5AtgC5PEgAa9AOIl6OLj4KhCACf5z98+KBSEAAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAaCAYAAAAHfFpPAAADGElEQVR4Xu2WT6hMURzHh/cSCwtZoJnm3ik1NQuKjYUUC2qyIIlYyJ8ikrJ4iVdSb2OFlLKQx0ZYvFK8WCnJ6hWRP6VXFvJKHvKeh4Tvb+Z3xm++c+6dO5o/FvdTv+4539/v/M7vnHvvuTeTSUlpK0EQbGGtmxQKhfWsdQ0s/lo+n1/NejcplUpzUMdn1hMRhuFZGQz7rTYDm7QaYm7wOAG+Mnz3WO8FqGUzbIz1xLjFso7HK9BNaFioL76XSD2odxHridANeMS64Nsc9I/DHlut16CevbAZ1puCu7td7/IG9uVyuXkRGyDxq6z2P8B1JgKDnkcNhD6ii91EujfeAf8+jDktB5T2D8IucFwzcMBuhA2j2W/1YrE43+W26M0qsx6L7w6rvlYXf470si/eAd9PXPpR+ALNPY4cIfqH1ZcIxJ/EsF1y5fk07yWrqf4D8XdZj0WTiX2CfYR90/7TbDa7kONR1CkuyAH9LfxzTV/yjJj2y7/R8SD2nV7Hab7Z0sdCS0arIPlhb1iPxL3/sD3siwJjrlBBNVDUEdPtkzicI0ulYzcmAbMwtiANyYGxF50D/aNR80MfjfJ5QfCrlgZkKou8nGQM4gaSxMWBz9oazdHntED/UUxYDei3o3xeJLilAZnKnTyWZAxippLExYHxTziH9FHDLas54HsBm2Q9Et2A16zHEVT/urwLC6rnx1Vt1/1F4onYGtZ/OuUxHzT9BrS+ylmgVF4r2Aqj1ZD5Q89PmxcEn9Ai97OvGb4NgLZEi9uBnNukrZ8wQQ6uKYr/oDEDVrfA/8zO5cbYGIuup+6T3QCCzsO+BNUTX/77p2G/OC4OLXylR59Q37D2v0s/8Pxl4v1erguKPbXhf6855On6Km2OccT52gomugN7yPq/gDyjrDncF8ShG3HIag79otnXpbO0Y7dR9G78a+RYFwJ9ekx/LG5O8SHfYtY7BiYcwoTXWW8F5JhgzaF3e5208UqdQXuaYxxB9a/1PusdB5M+wLu8jPV2gfyDsJv09WDkgI3cnI6D4g6w1k2w+J2spaSkpETxByAoBLSWYIUMAAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAaCAYAAACD+r1hAAAAp0lEQVR4XmNgGAWDCsjLy88C4mR0cTk5OWN0MZDiX0CKGUj/B2InJPEskBiSUgYGBQWFhUCKGargP5DvAJMD8j9gaAAK1ELpbnRJEB/opAXIYnAAdc5zJCGwE5WUlNSQxBAAqiEQxgc6rRDdRjhQVFQUR5cE8t/BxID0K2Q5MABJAjXqgdhA0zWgNj6Eyj1AUQwCQEUZUEWgkKqQkpLigvHR1Y6CIQgA0WYvFLiXQ58AAAAASUVORK5CYII=>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAZCAYAAADnstS2AAAAoElEQVR4XmNgGAV0BfLy8tVycnKxyGJA/nxkPhgAFf6G0v8VFRXtoOxkEF9BQaEBWeFcUVFRHphioKQ9ktxfdMW1IBooOAGkGC7BAHbGdGlpaRlkMTAAKQTiZ2hiL5H5YCAjIyMEUqykpCQHExMXF+cGipUgq4MBFnQnAPlvkfkoACj5B4gvAE3nB7r1JNA2FXQ1KADoSQMgjkAXHwX0BQCi+SKsRIoPhAAAAABJRU5ErkJggg==>

[image11]: <data:image/png;base64,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>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAaCAYAAADbhS54AAABtElEQVR4Xu1Vu0rEUBANaqONhQga8yZYaSP+hAiCID6+xFKbFQTRxtYfELT0AxSsBWHRUisf+GC1WPGxnoF7N5Mhq0k2BoQcGO6dc2Ym55IbYhgVciIIgnHJlYEwDIclF4Prui3JaViWNQYMST4tMPvEcZxFyRM8zzuWXAxJxsAdEE9h2/ac1NMAb2KQ+mFgU2qEXMYIOOlCJy0N0PuuDnckNUJuY+DrnbTfgL55xDb144DXUid0Y4xOeyH5NNAz1YzE+V0ZQ/OyzrFfAVfjNUlA3T4+mknaF25MmWjz2L/Q5431lO4erxXoRc2dTgo3Bu5S81gbtGLQOnFYR+LVEaA/YulheeHGaGADccN5vKJ+nnOgdgqxJ7g/MXam1mdQfbJGgh2Gx2fSfEJmY2hY4txPwzWgbyFmEvhD6sXfw5JaZmPIz4WxW53j4q9iPxpVt2uakiOAr1EvYlZqeYzRoDrLrxD3WosqDcP3fVfV73JeAwdZIx3rhtRyGcP/cULnpmkOqIe3+OVH/oF4UtHEw3e0pvQ3pT0gXhFfXM9srCxUxrLi/xrDRZ+WXBmgL1pyFSqUgW/q1LGMdBuIYwAAAABJRU5ErkJggg==>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAZCAYAAABQDyyRAAABbUlEQVR4Xu2Uu0rFQBCGjxZqK1glITdSaARLFQvRQizstBPOExztbMRKEHvBTsHS0tbOUnwOwUZsxQse/UY2ECeXs1EEhXzwQ3bmn53ZTUin09LSnCEdqCMIgj30JgrDcFXnrWGDZfSODnSuCryv6ESekyQZ5bnPEGPaV4vv+13TeEvn6sD/gO6zNY2PZJ8oimbzvkoo2DWN13VuENREUhvHsZ+P03wmvy6FwmNzVfM6Zwv11zKAPKdpOsItrmhPAQou0BPmWOeaYm5OdM5BlthzWtbyGrT3EwzbpmBB575DNgAN97OYHExirut6ee8XMOyY4g2da0I2QEX8TscLYNo05p7O2TBggEK8Er7aRSng+g51rg78N2WNGg+Q4XleQuEzOtW5Mnj3k2WNzGHOdNwaisfZ5ErHy8D3iP8yt5ZfcmGoX4WGt+baX1Cf0LD2/A14xy4TrtnoJ3/IShzHmWDjORsxxJSub2n513wAR4FsT0ikmo4AAAAASUVORK5CYII=>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAZCAYAAABOxhwiAAAB9klEQVR4Xu2VvUoDQRSFI6KNfyiGhc1uNtkEAlGQmEYEsbSxtVF7sfMZApaCjVba2dj4BFr4BgoKgiAiaCNoAv5EY4hn4t14c51sIhJB3A8umZw5d+fsMJmEQgEB/wTLsoYcx7lBVVAXrusOSM9vgLW3KcNLNBpdlPN1pNPpbhWaSR3UnGFa28F61wjrsu97qBPuqQOTeanZtj0KvSz1doG1xmOx2K5Gr0ithppE0zLX4vH4mG8TAc+81DjZbLYrlUr1SV2C9dfxrKLUfTNg8p6Oxj7T8tj1Ke7TgRc04C1IXWEYRg/mXqWuA75JylD2XhTjBdSd9HI6qcmrPM7arDQ1IhKJWOh54BqFLnGtGfCfexmw/qH6Lj1fwO6aIvyp9PiRSCRs9DyqMYV+k55WUM/gOdRtJz01cL5mYHqm8TRrPJZeP7zwPwitdnok9HGrFbwc0ldDN4kHXOl0P+i/oOTQJnwH9FyiVrmGTVyi8Btcr4KAc40CKh3NE1LX4YVWY9M0hzF+kh4/fDIcaDcCYsanSatL8PKDXmgPCl89862g1lI9Gn0HtSX1KqoJlRNaDnXENR3JZLLf0dy/Cgpfd9s0Ar5NR/w2wuFwb9PNcz5/DGf0uSM9OnCUVqTGUXeybid1YM01WvuWPovqD0z6AgICAgL+Pu/8G5oUSCVbmAAAAABJRU5ErkJggg==>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAABhklEQVR4Xu2WPUvDUBSGs7g5iBBwyKdkkeoUJ8HBxVHc1MGtg+Dm2j/g33BwchQcXXVxEBREkIKCKAh2FUR9DyYST865jcO9LveBl9onb5J72iYxCDwez7+Tpuklco7sJkmynWXZFrKJbFB43zY45xTW8sl9DbatIDfUQQ759hZVUcsr79ugKIoQH+5989y8Q8DvIR/1e3wYO1r3ByrEcbyME/SiKCrwOksZu6MlxgxI2+a4w6D7TfcLFC4Ed4ah57l3gTYghliXPNyb5FVQXkKOuHeFNiDcqeKHklf5U9kChgFHir+WvAh+BgcU7l1iGFDz9BRoeREqYsCMewnckBZwnS52SRiGk3x/DcMgj4q/knwLlPqdihV5nq9i8WtdQo8Bvr+GYUDtGryTfAt8cbedipYxDDhQfLe7qHZg15jWQR6XxjR3yHHTiZgO7BLTOuCfkGH9Hr+6GeqWZTnR7IlUB37n3hXp92OAbiQPVejvkdB7QZ6RE1oz/dfFOx6Px+PxeILgC8JypC3fJuGMAAAAAElFTkSuQmCC>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAZCAYAAABOxhwiAAABmElEQVR4Xu2Vu0rEUBCGt9HGC3gJgdw22UQjwS5v4wNY2/sGvoEgtlYWVoKFjYWFYmthJSpYaCG4rrji+o+cA8cxl5MULuL5YGAyZyb5cu90DIZ/SBRFXTDi9d+GHFzXXeD1Umhg3OI4/l4j8TAMjzDQH6e453nzOP61tjiaPIgfYOBBVxx9a7ymkuf5RJqmM7xeBR3b9/1VbXEp20Qc74ON3ideJ2zbnsLaG69Xgf5dXLwVbXE07cdx7ItcW5ygO4X+Z7UmpIdqrQ7LsqYxc065ljgtoulYbjcVJ+ikMdOnXEi/8546MPMhcy1xLtlGnJDyLaW3giDI5XatOJ6nbXqm1FpbcfE1GCIGfK2KLMsmMXOp1mrFsXiIOGExEkH5Dp8pQkpT7jjOIvIX3lMGZpcKHK6Ewylt85lCxID2FcctnpPSEiH/9cy3AftcJ4fSK15EE/EkSWbR+8rrhJD/9rXRBXOb5NDr9Zb52g/QeIG4R9yIoPyM96ng/djgNRX6+dAJ8HoZ4u49Im6Fw1235D9hMBgMhr/LJ7sIivBe/IbVAAAAAElFTkSuQmCC>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAZCAYAAABHLbxYAAABiUlEQVR4Xu2VvUrEQBSFd2URfQBFMMkmJI0BwcpGUBCfwM5HEN/BSh9A0FLsrCzsFLESCwUbOxtRELFTWH+KdUHPXcZl9pCbzca1cj44LDnnzsydYbKpVBwOR61erzfZ/MHzvCQIgkvUfEGnnP85WPTGLN4W50IYhgt2hucZrbZNFEWz7A0KLNzQFhcfza2S14QubK9DmqbDCO+hczxWOf8NWqNxHI+LL7+2j8ZPsuqZIRRdQ3e4O6MclkFrFPdyXfH3snwVFB/JItjhBGf9kNPoYZYPbyfL74nZYQsnPM1ZEbRGcQBnir8lPtab5KwQGLwpE+DFm+csD61RePuKv238GmeFwOA1mQA7XuEsD61R7Y7C283ye4JBGzIQWuSsCDmNzolf9q3vYHb2CU1x1g9ao4I5gGXy3qBn28sEOz1G4UuSJGOclQFzfWiNmtNrWVZVauGHlteFFFxBt6gZ4bAMmOsVeoIejB7lpHzfj6lO/rffoQNpEge1ZOddmE/oQL9IDofD8U/4Bumtg5Np+8dTAAAAAElFTkSuQmCC>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAZCAYAAABOxhwiAAAB0UlEQVR4Xu2Vu0oDQRiFQ0BFRcEbC9l1k2wCgZSmUFDwCSxtfAUbwVoQLL00gqWNlbXPIGhr6QMIgghijBJFPX+YXf49TNaNEkHcD37YOXMmc+aym1wuI+Of4Pv+UrFYvEN9oC4g5dnzGyDHpclwUyqVlrk/BkyHqCPVbslg/Eigff2kXq8PYs7XsI3nPbOAc+2LIQasbp41Ka31E8zVRB2QdisZXNed0noHx3FGbSFtmg141ljTNBqNgVqtNsY6E85XrVZnlLYuGjb1VHsj0LmDa7FIWqrg5XLZge+BdcFsSpt1G/DNoXa1hsDbJse+1hMxA95Zt4Gj9OBtas2Eju7sd8D4e8mBUxjiPitY6ZUMKBQKI9zXjUqlMosxT/JsQr+xpxeCIPDN5kUfjUTkJTWrjO5aWsLwPw0tmNDHrFvBPZ/o6WgIz/Mm5XqgnrmvFzD+EbXJejfyEloLaJ/odhJhaHnGFZvGc4s9acCJX2MDV7SWmKNoeRFtmg1zUrEX0YTv3Pm0wH+G4Ataw2+vSmktAgPastu2Yi+DazUO3wvrggkf+9p0A74tnjssnOYw++WIXTaq+vKuYoc2WNPIn48sgHXGMndU7M3IyMjI+Pt8AhjKlnkEvRxoAAAAAElFTkSuQmCC>

[image19]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAXCAYAAAARIY8tAAABcUlEQVR4Xu1SPUvEQBBNCgstBBvBkE8SwT5gbWmlnYilrViL2PkDrGwE/4CVWIrWthZ+IRZWYiGod+C3om82szo3SfBO2zwYsvvem3m7d+s4DXqE6/v+qCZ7QRRFH5ozgHCF+qTSWreI43iZ+nHIfq0ZQDz+T4A9YJIk41ozYMOp5rsB+g7DMFziGfNaNyAR15zV/G/A4CH0HqF3jAPWtIeGz5GouFU0TUuuCvC989LlgL0OAwHkuQ3wPG8A68ssywbxfdReCZx+Bp4Vu+eAa+mRwgVdF6feYe7FhtZB6zyn3EMkhu9i+IbW6oCebTzJTHHlAPpjWTjh736HoQJ5nvfB94ZqqyoHgDiTJJvWpUeDhuHjVvCVAUR+v3/a41ZbvG79OAtAmwC/qXlCbQC9BrlHLTjFszsQVho+SXqapoHkLaDdkE4v0RAwDuvEIAimOORe8tg/o25Rraj4/UeshgMuYv/A+h3qCfUq+xs0+Bu+AIO1f5+74bmBAAAAAElFTkSuQmCC>

[image20]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE4AAAAWCAYAAABud6qHAAACIUlEQVR4Xu2Xv0tcQRDHnxoxhRACXor7/UtMKsULRAjYJIIgpEpjQOsgiIiVhWClhb21ItobSFASCIjxPzBCiAiB1KYRjQrmM9weruOhexcO7t3tB4ZlZ7677M6bfW9fEHg8Ho+nYlKp1J9kMjmGPc5ms49o3+I7tjXpdHoT33IikcjRbclkMr3otvD32bq6hcUOsYErbELHqsXMd8NisVhcaXa1Blu3NaGABL40i1/SsUqReZhvkXaZ9pWOC8S+Ul3TtGvYjI6Hjng83s1G/mIbOuaKJE77NGi+0LRof+iJRqNdbO6YqtjRsftwTNznoBETV4LEPWSTR9h3um06Xg5JHON+0O5je9gl7ge2hiO8jU0RO6ddMWPe25rQk8vlnqSKX8otHSuHJCGfz3dY/U+6CknSB2ze6ssDknfja0sWTrgi9EhFsKlVHasExj+VpGBzOmZjNHcec64vz11Nj605JGzQPP0FHXNEH+lWk5SDkqNQKLTbAsExcW9cLbi9jtpAZYyaxVd9p2PsT5lDjl7JF4lEOs28u9LnUpw0/Y/XI90SV1dQWZOyYPOU/gvm+sVcJ7aPJA6bpLwzmqz05fJt64xGPiT1j7ygWWy/9lcLH5IE8x3aPvpn2KnySWW1lvqsY1Z8dqU2HVTSuKme36b9pjVB8b13jl0YzZUcaS3yNBr8YsV42iMuxjEa0OObFvm1IiEvXIzkPdPjPR5PrfkHksCobnsWwnMAAAAASUVORK5CYII=>

[image21]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAWCAYAAAC/kK73AAAAuklEQVR4Xu2VvQlCQRCEnyUIRudxP2JiBYqBYGymmWAFamZiLlZgaA+WYFuaqCNsNNELd3n7wSQ3HHx7LFzTOI7D9PhANTnnJfJFLtypJKW0E+EDdyoppZxFeM2dSiB6Qz4Qn3GnEsg+kBdWY8SdWiB7lLWYc2cCiJ9kgA13JoD4VgbYc2eCWuviPwBW6cqdCWKMYwzwRu7cmQAv34f8k8+dzoAdHmIFVm2i6kcNIQwgNG0TyE/4vtMFfr7rLGC6E0g9AAAAAElFTkSuQmCC>

[image22]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC4AAAAWCAYAAAC/kK73AAAAtElEQVR4Xu2TPQpCMRCEnz+FgthIbBKSQFJ4F8/hncRbaO0JRLCzfVhY2AgWVlo4r5OpBXdhP5gi+ZrZJWkawzCMv5JSWvKdaFB4g7xyzgt2IkHZPfIopczZSWSIsmfkEkIYsxRHrXWKsjfkiGOfvTiwVY+yT7zfHTvRdB8Oxd8xxjU7FXxtfstOBc65CQa4YoADjj32GhhggBPSYogRSxV0zwcD3L33M3YqwAde8Z1hGL/nA++rHaUj2kAMAAAAAElFTkSuQmCC>