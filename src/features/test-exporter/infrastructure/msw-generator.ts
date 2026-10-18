import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function generateMswHandler(call: DetectedApiCall, mock: GeneratedMock): string {
  const method = call.method.toLowerCase();
  const url = call.url;
  const jsonBody = JSON.stringify(mock.body, null, 2);

  const handlerMethod = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)
    ? method
    : 'all';

  return `// MSW v2 handler for ${call.method} ${url}
http.${handlerMethod}('${url}', () => {
  return HttpResponse.json(${jsonBody}, {
    status: ${mock.statusCode},
  });
});`;
}
