import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function generatePlaywrightSpec(call: DetectedApiCall, mock: GeneratedMock): string {
  const method = call.method.toUpperCase();
  const url = call.url;
  const jsonBody = JSON.stringify(mock.body, null, 2);

  if (method === 'GET' || method === '*') {
    return `// Playwright mock for ${method} ${url}
await page.route('**${url}', async (route) => {
  await route.fulfill({
    status: ${mock.statusCode},
    contentType: 'application/json',
    body: JSON.stringify(${jsonBody}, null, 2),
  });
});`;
  }

  return `// Playwright mock for ${method} ${url}
await page.route('**${url}', async (route) => {
  if (route.request().method() === '${method}') {
    await route.fulfill({
      status: ${mock.statusCode},
      contentType: 'application/json',
      body: JSON.stringify(${jsonBody}, null, 2),
    });
  } else {
    await route.fallback();
  }
});`;
}
