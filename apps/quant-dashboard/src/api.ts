import type { BondAnalysisRequest, BondAnalysisResponse } from './types'
type ProblemDetails = { title?: string; detail?: string; errors?: Record<string, string[]> }

export async function analyseBond(request: BondAnalysisRequest): Promise<BondAnalysisResponse> {
  const response = await fetch('/api/bonds/analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) })
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as ProblemDetails | null
    const validationMessage = problem?.errors && Object.values(problem.errors).flat()[0]
    throw new Error(validationMessage || problem?.detail || problem?.title || 'The bond analysis could not be completed.')
  }
  return response.json() as Promise<BondAnalysisResponse>
}
