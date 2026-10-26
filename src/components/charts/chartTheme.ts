export const chartColors = {
  bg: '#FFFFFF',
  ink: '#172033',
  text: '#172033',
  muted: 'rgba(36,62,99,.68)',
  faint: 'rgba(36,62,99,.52)',
  grid: 'rgba(36,62,99,.13)',
  track: 'rgba(36,62,99,.10)',
  data: '#243E63',
  dataSecondary: '#506986',
  dataTertiary: '#71849A',
  hero: '#7B5718',
  heroSoft: '#E8B08E',
  mint: '#9BE6C0',
  mintInk: '#1F6B4F',
  warning: '#B7791F',
  neutral: '#9AA6B5',
  series: ['#243E63', '#506986', '#71849A', '#7B5718', '#8F9DB0', '#AAB5C3'],
  ramp: ['#243E63', '#506986', '#617A98', '#71849A', '#7B5718'],
  quality: {
    verified: '#243E63',
    pending: '#C3A15A',
    disputed: '#7B5718',
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
