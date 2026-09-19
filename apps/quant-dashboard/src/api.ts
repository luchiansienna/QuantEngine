import type {
  BondAnalysisRequest,
  BondAnalysisResponse,
  IbkrOptionSnapshot,
  IbkrOptionSnapshotRequest,
  OptionAnalysisRequest,
  OptionAnalysisResponse,
} from './types'

async function readResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    const problem =
      (await response.json().catch(() => null)) as
        | ProblemDetails
        | null

    const validationMessage =
      problem?.errors &&
      Object.values(problem.errors).flat()[0]

    throw new Error(
      validationMessage ||
        problem?.detail ||
        problem?.title ||
        fallbackMessage,
    )
  }

  return response.json() as Promise<T>
}

export async function loadIbkrOptionSnapshot(
  request: IbkrOptionSnapshotRequest,
): Promise<IbkrOptionSnapshot> {
  const parameters = new URLSearchParams({
    symbol: request.symbol.trim().toUpperCase(),
    expiry: request.expiry.replaceAll('-', ''),
    strike: request.strike.toString(),
    optionType: request.optionType,
  })

  const response = await fetch(
    `/api/market-data/options/snapshot?${parameters}`,
  )

  return readResponse<IbkrOptionSnapshot>(
    response,
    'The IBKR market-data snapshot could not be loaded.',
  )
}

type ProblemDetails = { title?: string; detail?: string; errors?: Record<string, string[]> }
export async function analyseBond(
  request: BondAnalysisRequest,
): Promise<BondAnalysisResponse> {
  const response = await fetch('/api/bonds/analyse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  return readResponse<BondAnalysisResponse>(
    response,
    'The bond analysis could not be completed.',
  )
}

export async function analyseOption(
  request: OptionAnalysisRequest,
): Promise<OptionAnalysisResponse> {
  const response = await fetch('/api/options/analyse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  return readResponse<OptionAnalysisResponse>(
    response,
    'The option analysis could not be completed.',
  )
}
export async function postRisk<T>(path: string, request: unknown): Promise<T> {
  return readResponse<T>(await fetch(`/api/risk/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }), 'Risk calculation failed.')
}
