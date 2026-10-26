export const chartColors = {
  bg: '#FFFFFF',
  ink: '#24312E',
  text: '#172033',
  muted: 'rgba(36,49,46,.68)',
  faint: 'rgba(36,49,46,.52)',
  grid: 'rgba(36,49,46,.13)',
  track: 'rgba(36,49,46,.10)',
  data: '#2F574C',
  dataSecondary: '#41655A',
  dataTertiary: '#6F644E',
  hero: '#A95040',
  heroSoft: '#E8B08E',
  mint: '#9BE6C0',
  mintInk: '#1F6B4F',
  warning: '#B7791F',
  neutral: '#9AA6B5',
  series: ['#2F574C', '#41655A', '#6F644E', '#A95040', '#C18672', '#8C9B7A'],
  ramp: ['#2F574C', '#41655A', '#536B60', '#6F644E', '#A95040'],
  quality: {
    verified: '#2F574C',
    pending: '#C3A15A',
    disputed: '#A95040',
    duplicate: '#B9C2C7',
  },
};

export function niceMax(value: number, steps = 4): number {
  if (value <= 0) return 1;
  const rough = value / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(1, nice * magnitude * steps);
}

export function axisTicks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => Math.round((max / count) * index * 100) / 100);
}
