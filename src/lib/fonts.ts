import localFont from 'next/font/local';

export const plusJakartaSans = localFont({
  src: [
    { path: '../../public/fonts/pjs-normal-300.woff2', weight: '300', style: 'normal' },
    { path: '../../public/fonts/pjs-normal-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/pjs-italic-400.woff2', weight: '400', style: 'italic' },
    { path: '../../public/fonts/pjs-normal-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/pjs-normal-600.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/pjs-normal-700.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/pjs-normal-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-pjs',
  display: 'swap',
});

export const lora = localFont({
  src: [
    { path: '../../public/fonts/lora-normal-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/lora-italic-400.woff2', weight: '400', style: 'italic' },
    { path: '../../public/fonts/lora-normal-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-lora',
  display: 'swap',
});
