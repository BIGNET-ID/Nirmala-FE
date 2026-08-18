export const METRICS = {
  rain: {
    key: 'rain',
    label: 'Intensitas Hujan',
    unit: 'mm/jam',
    icon: 'solar:cloud-rain-bold-duotone',
    colorRamp: 'linear-gradient(to right, rgba(0,229,255,0.4), #00e676, #ffeb3b, #ff9800, #f44336)',
    min: 0,
    max: 120,
    thresholds: [5, 25, 50, 75, 100],
  },
  temp: {
    key: 'temp',
    label: 'Suhu Udara',
    unit: '°C',
    icon: 'solar:thermometer-bold-duotone',
    colorRamp: 'linear-gradient(to right, #002699, #00e5ff, #ffeb3b, #ff4081)',
    min: 20,
    max: 36,
    thresholds: [22, 26, 30, 34],
  },
};