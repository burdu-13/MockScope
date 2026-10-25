import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

export function generateMswHandler(call: DetectedApiCall, mock: GeneratedMock | any): string {
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

  const handlerMethod = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)
    ? method
    : 'all';

  return `http.${handlerMethod}('${url}', () => {
  return HttpResponse.json(${jsonBody}, {
    status: ${statusCode},
  });
});`;
}
