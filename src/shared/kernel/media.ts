
export interface PlaceholderOptions {
  label?: string;
  width?: number;
  height?: number;
  type?: 'poster' | 'avatar' | 'backdrop' | 'image';
}

export function detectImageType(fieldNameOrPath: string): PlaceholderOptions {
  const lower = fieldNameOrPath.toLowerCase();

  if (lower.includes('poster')) {
    return {
      type: 'poster',
      width: 500,
      height: 750,
      label: 'Poster Asset',
    };
  }
  if (lower.includes('backdrop') || lower.includes('banner')) {
    return {
      type: 'backdrop',
      width: 1280,
      height: 720,
      label: 'Banner Asset',
    };
  }
  if (lower.includes('avatar') || lower.includes('profile')) {
    return {
      type: 'avatar',
      width: 160,
      height: 160,
      label: 'User Avatar',
    };
  }
  return {
    type: 'image',
    width: 600,
    height: 400,
    label: 'Media Asset',
  };
}

export function generatePlaceholderSvg(options: PlaceholderOptions = {}): string {
  const type = options.type || 'image';
  const width = options.width || (type === 'poster' ? 500 : type === 'avatar' ? 160 : type === 'backdrop' ? 1280 : 600);
  const height = options.height || (type === 'poster' ? 750 : type === 'avatar' ? 160 : type === 'backdrop' ? 720 : 400);
  const label = options.label || (type === 'poster' ? 'Poster Asset' : type === 'avatar' ? 'User' : 'Placeholder Image');

  const centerX = width / 2;
  const iconY = height * 0.42;
  const textY = height * 0.62;
  const subY = height * 0.72;

  let iconSvg = '';
  if (type === 'avatar') {
    iconSvg = `
      <circle cx="${centerX}" cy="${iconY - 10}" r="28" fill="#64748b" />
      <path d="M ${centerX - 35} ${iconY + 36} C ${centerX - 35} ${iconY + 16}, ${centerX + 35} ${iconY + 16}, ${centerX + 35} ${iconY + 36} Z" fill="#64748b" />
    `;
  } else if (type === 'poster') {
    iconSvg = `
      <rect x="${centerX - 32}" y="${iconY - 40}" width="64" height="80" rx="4" fill="none" stroke="#60a5fa" stroke-width="3" />
      <circle cx="${centerX - 16}" cy="${iconY - 24}" r="5" fill="#60a5fa" />
      <circle cx="${centerX + 16}" cy="${iconY - 24}" r="5" fill="#60a5fa" />
      <line x1="${centerX - 32}" y1="${iconY}" x2="${centerX + 32}" y2="${iconY}" stroke="#60a5fa" stroke-width="2" />
      <circle cx="${centerX - 16}" cy="${iconY + 20}" r="5" fill="#60a5fa" />
      <circle cx="${centerX + 16}" cy="${iconY + 20}" r="5" fill="#60a5fa" />
    `;
  } else {
    iconSvg = `
      <rect x="${centerX - 40}" y="${iconY - 28}" width="80" height="56" rx="6" fill="none" stroke="#94a3b8" stroke-width="3" />
      <circle cx="${centerX - 18}" cy="${iconY - 10}" r="7" fill="#94a3b8" />
      <path d="M ${centerX - 32} ${iconY + 20} L ${centerX - 6} ${iconY - 2} L ${centerX + 14} ${iconY + 14} L ${centerX + 32} ${iconY + 6}" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)" />
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#334155" stroke-width="2" rx="4" />
  ${iconSvg}
  <text x="${centerX}" y="${textY}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="${Math.max(12, Math.floor(width * 0.045))}" fill="#f8fafc" font-weight="600" text-anchor="middle">${label}</text>
  <text x="${centerX}" y="${subY}" font-family="monospace" font-size="${Math.max(10, Math.floor(width * 0.028))}" fill="#64748b" text-anchor="middle">${width}x${height} [MockScope Offline]</text>
</svg>`.trim();
}

export function generatePlaceholderDataUri(options: PlaceholderOptions = {}): string {
  const svg = generatePlaceholderSvg(options);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
