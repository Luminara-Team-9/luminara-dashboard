import type { AiActionApplyRequest, AiActionApplyResponse } from '@/shared/lib/types';

export async function requestAiActionApply(
  payload: AiActionApplyRequest,
): Promise<AiActionApplyResponse> {
  const response = await fetch('/api/ai-actions/apply', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as AiActionApplyResponse;

  if (!response.ok) {
    throw new Error(data.message || `AI action request failed: ${response.status}`);
  }

  return data;
}
