# Spec: Login Page Mengikuti Tema (Light/Dark) — "Badai Siang"

**Tanggal:** 2026-08-18
**Status:** Disetujui (langsung ke implementasi atas permintaan user)

## 1. Tujuan
Halaman login mengikuti mode tema aplikasi (light/dark) yang dipilih user di dashboard. Di **light mode**, background jadi putih-keabuan tetapi **awan dan petir tetap sangat tampak** (nuansa *badai siang dramatis*). Dark mode tidak berubah.

## 2. Konteks
- `ThemeModeContext` menyimpan `mode` ('light'|'dark') di `localStorage['nirmala-theme']` dan meng-set `data-theme` di `<html>`. Expose `useThemeMode()`.
- Login page (`src/app/(auth)/login/page.jsx`) saat ini **hardcode warna gelap** (bg `#050811`, kartu `rgba(10,16,36,0.72)`, gradien & overlay gelap) dan me-render `WeatherScene` (dark-first).
- `WeatherScene` ada di dalam `<Canvas>` r3f yang **mengisolasi React context** → `useThemeMode()` tidak menembus ke dalam scene. Maka `mode` **dioper sebagai prop**.

## 3. Keputusan (disetujui)
1. Nuansa light = **badai siang dramatis** (awan abu lebih gelap di langit pucat, petir menyambar terang).
2. Petir light = **bolt inti terang + outline biru-gelap**, dan **flash menerangkan awan** (bukan tetap putih; bukan menggelapkan).
3. Sumber tema = **otomatis ikut preferensi tersimpan** (`nirmala-theme`), tanpa toggle terpisah di login.

## 4. Requirements

### 4.1 Aliran data
- `login/page.jsx`: `const { mode } = useThemeMode();` → `<WeatherScene mode={mode} />` (juga ke `LensRain` bila perlu).
- `WeatherScene({ mode })` mem-thread `mode` ke `CloudField`, `Storm`, `Rain`, `WarpFX`, background/fog, dan visibilitas `Stars`.
- Palet disimpan sebagai konstanta ber-key mode di WeatherScene (mis. `PALETTE[mode]`) sebagai satu sumber kebenaran.

### 4.2 Palet scene — LIGHT
- **Background & fog**: `#e9eef5` (selaras token `--nirmala-map-bg` light); `fogExp2` warna sama, densitas serupa.
- **Awan**: palet abu-biru **lebih gelap** (rentang ~`#5a6576`–`#8b96aa`) → kontras tinggi terhadap langit pucat, tetap bertekstur (Lambert + lighting).
- **Lighting**: ambient/hemisphere disesuaikan untuk siang; directional key tetap agar tekstur/bentuk terbaca.
- **Stars**: **disembunyikan** di light mode.
- **Rain**: warna streak lebih gelap/kelabu (~`#5a6b8a`, transparan) agar terlihat di latar terang.

### 4.3 Palet scene — DARK
- Tetap seperti implementasi sekarang (bg `#050811`, awan pucat, bintang tampil, hujan `#c3d8ff`, dst). Tidak ada regresi.

### 4.4 Petir (light)
- **Bolt**: garis inti `#ffffff` + garis "halo" berwarna **biru-gelap** (mis. `#2b3f6e`/`#38507f`) menggantikan cyan pucat → kontras di latar terang.
- **Flash** (Storm + WarpFX): tetap menaikkan intensitas point/ambient light → awan gelap **menyala terang** = kilat jelas. Nilai intensitas boleh disesuaikan agar tak over-expose di latar terang.
- Dark: bolt & flash seperti sekarang.

### 4.5 Chrome login page (ikut mode)
- **Kartu login**: light → `rgba(255,255,255,0.72)` glass + border/shadow terang; teks via token MUI (sudah mode-aware). Dark → seperti sekarang.
- **Gradien statis underlay** + **fallback reduced-motion**: versi terang di light (mis. radial `#f4f7fb → #dbe3ee`).
- **Legibility overlay**: light → vignette **terang** tipis (atau intensitas dikurangi); dark → gelap seperti sekarang.
- **Eyebrow/aksen**: gunakan `var(--nirmala-cyan)` (otomatis `#0e7490` di light, `#00e5ff` di dark).

### 4.6 Cinematic sukses login
- Tidak berubah alurnya. Kilat putih klimaks tetap (di light pun kontras karena bg cuma abu-terang). Reveal dashboard putih menyambung ke dashboard (yang juga mengikuti mode).

## 5. Acceptance Criteria
1. Set light mode di dashboard → buka `/login` → background putih-keabuan, awan abu gelap jelas terlihat, langit pucat, tanpa bintang.
2. Petir di light mode terlihat jelas: bolt kontras + flash menyalakan awan.
3. Kartu login, gradien, overlay, aksen ikut terang di light; teks terbaca (kontras memadai).
4. Dark mode identik dengan sekarang (tak ada regresi).
5. Ganti mode di dashboard → refresh `/login` → login mengikuti (via `nirmala-theme`).
6. Reduced-motion: fallback gradien mengikuti mode; tanpa animasi berat.

## 6. File tersentuh
`src/components/auth/WeatherScene.jsx` (prop `mode` + palet ber-mode), `src/app/(auth)/login/page.jsx` (`useThemeMode`, oper prop, chrome adapt), `src/components/auth/LensRain.jsx` (opsional tint droplet bila perlu).

## 7. Di luar cakupan
Toggle tema terpisah di halaman login; perubahan tema dashboard (sudah ada); animasi/efek baru selain penyesuaian warna per mode.
