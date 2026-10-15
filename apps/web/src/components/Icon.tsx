import type { CSSProperties } from 'react';

const paths = {
  swap: 'M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  camera: 'M8 6l2-3h4l2 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  check: 'M5 12l4 4L19 6',
  copy: 'M8 8h12v13H8zM16 4V2H3v14h2',
  share: 'M12 15V3m-4 4 4-4 4 4M5 12v9h14v-9',
  tune: 'M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10M8 3v6m6 0v6M6 15v6',
  close: 'm6 6 12 12M18 6 6 18',
} as const;

export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
