
export function synthesizeStringValue(fieldName: string = 'text'): string {
  const lower = fieldName.toLowerCase();

  if (lower.includes('uuid')) {
    return 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
  }
  if (lower.includes('email')) {
    return 'alex.developer@example.com';
  }
  if (lower.includes('date') || lower.endsWith('at')) {
    return '2026-10-18T12:00:00Z';
  }
  if (lower.includes('poster') || lower.includes('backdrop')) {
    return '/sample_poster_path.jpg';
  }
  if (lower.includes('overview') || lower.includes('description') || lower.includes('bio')) {
    return 'High-performance engineering and low-latency systems.';
  }
  if (lower.includes('url') || lower.includes('avatar') || lower.includes('image')) {
    return 'https://images.unsplash.com/photo-example';
  }
  if (lower.includes('phone') || lower.includes('mobile')) {
    return '+1 (555) 019-2834';
  }
  if (lower.includes('title')) {
    return 'Senior Software Architect';
  }
  if (lower.includes('name')) {
    return 'Acme Commerce';
  }
  if (lower.includes('media_type') || lower.includes('mediatype')) {
    return 'movie';
  }
  if (lower.includes('status')) {
    return 'active';
  }
  if (lower.includes('token') || lower.includes('secret')) {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMC6Y5ee3BiLnPpQI-BaGeSuPffQ';
  }
  if (lower.includes('id')) {
    return 'usr_98a72b';
  }

  return `sample_${fieldName}`;
}

export function synthesizeNumberValue(fieldName: string = 'amount'): number {
  const lower = fieldName.toLowerCase();

  if (lower.includes('vote')) {
    return 8.4;
  }
  if (lower.includes('rating') || lower.includes('score')) {
    return 4.8;
  }
  if (lower.includes('price') || lower.includes('amount') || lower.includes('cost') || lower.includes('cents')) {
    return 2499;
  }
  if (lower.includes('count') || lower.includes('quantity') || lower.includes('total') || lower.includes('page')) {
    return 5;
  }
  if (lower === 'age' || lower.includes('userage') || (lower.endsWith('age') && !lower.includes('average') && !lower.includes('percentage') && !lower.includes('page'))) {
    return 29;
  }
  if (lower.includes('year')) {
    return 2026;
  }
  if (lower.includes('popularity')) {
    return 42;
  }
  if (lower.includes('id')) {
    return 101;
  }

  return 42;
}

export function synthesizeBooleanValue(fieldName: string = 'flag'): boolean {
  const lower = fieldName.toLowerCase();
  if (lower.includes('adult')) {
    return false;
  }
  return true;
}
