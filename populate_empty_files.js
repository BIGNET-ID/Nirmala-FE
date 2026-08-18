const fs = require('fs');
const path = require('path');

const emptyFiles = [
  'src/context/AuthContext.jsx',
  'src/app/layout.jsx',
  'src/app/providers.jsx',
  'src/app/(auth)/layout.jsx',
  'src/app/(auth)/login/page.jsx',
  'src/app/(dashboard)/sensors/page.jsx',
  'src/app/(dashboard)/layout.jsx',
  'src/constants/mapConfig.js',
  'src/constants/metrics.js',
  'src/components/auth/AuthGuard.jsx',
  'src/components/dashboard/HeaderNavbar.jsx',
  'src/components/dashboard/MetricLayerSelector.jsx',
  'src/components/dashboard/ColorRampLegend.jsx',
  'src/components/dashboard/SensorDetailDrawer.jsx',
  'src/components/dashboard/TimelinePlayer.jsx',
  'src/components/common/LoadingOverlay.jsx',
  'src/components/common/AppIcon.jsx',
  'src/components/common/GlassCard.jsx',
  'src/components/map/GoogleMapWrapper.jsx',
  'src/components/map/SensorMarker.jsx',
  'src/components/map/MapControls.jsx',
  'src/hooks/useAuth.js',
  'src/hooks/useMapInterpolation.js',
  'src/lib/algorithms/quadTree.js',
  'src/lib/algorithms/colorScales.js',
  'src/lib/algorithms/vectorInterpolation.js',
  'src/lib/theme.js'
];

emptyFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  const ext = path.extname(file);
  const basename = path.basename(file, ext);
  
  let content = '';

  if (file === 'src/app/layout.jsx') {
    content = `export const metadata = {
  title: 'Nirmala Platform',
  description: 'Geospatial Weather & Telemetry Radar Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}`;
  } else if (file === 'src/app/providers.jsx') {
    content = `'use client';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

const theme = createTheme({ palette: { mode: 'dark' } });

export default function Providers({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}`;
  } else if (file === 'src/app/(dashboard)/layout.jsx' || file === 'src/app/(auth)/layout.jsx') {
    content = `export default function Layout({ children }) { return <>{children}</>; }`;
  } else if (file === 'src/app/(dashboard)/sensors/page.jsx' || file === 'src/app/(auth)/login/page.jsx') {
    content = `export default function Page() { return <div>Page: ${basename}</div>; }`;
  } else if (file === 'src/components/auth/AuthGuard.jsx') {
    content = `export default function AuthGuard({ children }) { return <>{children}</>; }`;
  } else if (file === 'src/components/map/GoogleMapWrapper.jsx') {
    content = `'use client';
import React from 'react';
export default function GoogleMapWrapper({ children }) {
  return <div style={{width:'100%', height:'100%'}}>Google Maps Area {children}</div>;
}`;
  } else if (ext === '.jsx') {
    const componentName = basename.charAt(0).toUpperCase() + basename.slice(1);
    content = `export default function ${componentName}() { return null; }`;
  } else if (ext === '.js') {
    content = `export const ${basename} = {};`;
  }

  if (content && fs.existsSync(fullPath) && fs.statSync(fullPath).size === 0) {
    fs.writeFileSync(fullPath, content);
  }
});

console.log('Populated empty files');
