import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function generateMswHandler(
  call: DetectedApiCall,
  mock: GeneratedMock | any,
  delayMs?: number
): string {
  const method = call.method.toLowerCase();
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

  const handlerMethod = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)
    ? method
    : 'all';

  const asyncPrefix = effectiveDelay > 0 ? 'async ' : '';
  const delayLine = effectiveDelay > 0 ? `  await delay(${effectiveDelay});\n` : '';
  const headersOption = Object.keys(customHeaders).length > 0
    ? `,\n    headers: ${JSON.stringify(customHeaders)}`
    : '';

  if (statusCode === 204) {
    return `http.${handlerMethod}('${url}', ${asyncPrefix}() => {
${delayLine}  return new HttpResponse(null, {
    status: 204${headersOption},
  });
});`;
  }

  return `http.${handlerMethod}('${url}', ${asyncPrefix}() => {
${delayLine}  return HttpResponse.json(${jsonBody}, {
    status: ${statusCode}${headersOption},
  });
});`;
}
