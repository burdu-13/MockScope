import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function toPlaywrightGlob(urlPattern: string): string {
  const normalized = urlPattern
    .replace(/\{([a-zA-Z0-9_]+)\}/g, '*')
    .replace(/:([a-zA-Z0-9_]+)/g, '*');
  return `**${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}

export function generatePlaywrightSpec(
  call: DetectedApiCall,
  mock: GeneratedMock | any,
  delayMs?: number
): string {
  const method = call.method.toUpperCase();
  const routeGlob = toPlaywrightGlob(call.url);
  const statusCode =
    mock && typeof mock === 'object' && ('statusCode' in mock || 'status' in mock)
      ? mock.statusCode || mock.status || 200
      : 200;
  const rawBody =
    mock && typeof mock === 'object' && 'body' in mock
      ? mock.body
      : mock;
  const jsonBody = JSON.stringify(rawBody !== undefined ? rawBody : {}, null, 2);

  const customHeaders: Record<string, string> = {};
  if (mock && typeof mock === 'object' && mock.headers && typeof mock.headers === 'object') {
    for (const [k, v] of Object.entries(mock.headers as Record<string, string>)) {
      if (k.toLowerCase() !== 'content-type' && v !== undefined) {
        customHeaders[k] = String(v);
      }
    }
  }

  const effectiveDelay = typeof delayMs === 'number' && delayMs > 0
    ? delayMs
    : typeof mock?.delayMs === 'number' && mock.delayMs > 0
    ? mock.delayMs
    : 0;

  const delayLine = effectiveDelay > 0
    ? `  await new Promise((resolve) => setTimeout(resolve, ${effectiveDelay}));\n`
    : '';
  const headersLine = Object.keys(customHeaders).length > 0
    ? `\n    headers: ${JSON.stringify(customHeaders)},`
    : '';
  const fulfillBlock = statusCode === 204
    ? `{\n    status: 204,${headersLine}\n  }`
    : `{\n    status: ${statusCode},\n    contentType: 'application/json',${headersLine}\n    body: JSON.stringify(${jsonBody}, null, 2),\n  }`;

  if (method === 'GET' || method === '*') {
    return `await page.route('${routeGlob}', async (route) => {
${delayLine}  await route.fulfill(${fulfillBlock});
});`;
  }

  const indentedDelay = effectiveDelay > 0
    ? `    await new Promise((resolve) => setTimeout(resolve, ${effectiveDelay}));\n`
    : '';
  const indentedFulfill = fulfillBlock.replace(/\n/g, '\n  ');

  return `await page.route('${routeGlob}', async (route) => {
  if (route.request().method() === '${method}') {
${indentedDelay}    await route.fulfill(${indentedFulfill});
  } else {
    await route.fallback();
  }
});`;
}
