import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function generatePlaywrightSpec(call: DetectedApiCall, mock: GeneratedMock | any): string {
  const method = call.method.toUpperCase();
  const url = call.url;
  const statusCode =
    mock && typeof mock === 'object' && ('statusCode' in mock || 'status' in mock)
      ? mock.statusCode || mock.status || 200
      : 200;
  const rawBody =
    mock && typeof mock === 'object' && 'body' in mock
      ? mock.body
      : mock;
  const jsonBody = JSON.stringify(rawBody !== undefined ? rawBody : {}, null, 2);

  if (method === 'GET' || method === '*') {
    return `await page.route('**${url}', async (route) => {
  await route.fulfill({
    status: ${statusCode},
    contentType: 'application/json',
    body: JSON.stringify(${jsonBody}, null, 2),
  });
});`;
  }

  return `await page.route('**${url}', async (route) => {
  if (route.request().method() === '${method}') {
    await route.fulfill({
      status: ${statusCode},
      contentType: 'application/json',
      body: JSON.stringify(${jsonBody}, null, 2),
    });
  } else {
    await route.fallback();
  }
});`;
}
