/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        card: 'var(--bg-card)',
        ink: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        faint: 'var(--text-tertiary)',
        line: 'var(--border-subtle)',
        brand: 'var(--brand-navy)',
        mint: 'var(--accent-mint)',
        data: 'var(--data-primary)',
        hero: 'var(--accent-terracotta)',
        success: 'var(--status-success)',
        warning: 'var(--status-warning)',
        danger: 'var(--status-danger)',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        numeric: ['Inter', '"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,32,51,.03), 0 10px 30px -24px rgba(23,32,51,.18)',
        float: '0 22px 60px -24px rgba(23,32,51,.28)',
      },
      borderRadius: {
        card: '18px',
        panel: '22px',
      },
      transitionDuration: {
        180: '180ms',
        220: '220ms',
        250: '250ms',
      },
    },
  },
  plugins: [],
};
