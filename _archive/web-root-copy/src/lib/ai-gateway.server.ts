const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
export function getLovableAiGatewayRunId(request: Request) {
  return request.headers.get(RUN_ID_HEADER) ?? undefined;
}
export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId;
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID_HEADER, runId);
      const response = await fetch(input, { ...init, headers });
      runId = response.headers.get(RUN_ID_HEADER) ?? runId;
      return response;
    },
    getRunId: () => runId,
  };
}
export function getLovableAiGatewayResponseHeaders(runId?: string) {
  return runId ? { [RUN_ID_HEADER]: runId } : {};
}
export function withLovableAiGatewayRunIdHeader(
  response: Response,
  runIdFetch: { getRunId: () => string | undefined },
) {
  const runId = runIdFetch.getRunId();
  if (runId) response.headers.set(RUN_ID_HEADER, runId);
  return response;
}
