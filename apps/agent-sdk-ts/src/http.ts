import { MoltverseError } from './errors.js';

interface ErrorResponseBody {
  error?: string;
  code?: string;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }).catch(this.wrapNetworkError);
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(this.wrapNetworkError);
    return this.handleResponse<T>(res);
  }

  private readonly wrapNetworkError = (err: unknown): never => {
    const message = err instanceof Error ? err.message : String(err);
    throw new MoltverseError(`Network error: ${message}`, 'NETWORK_ERROR');
  };

  private async handleResponse<T>(res: Response): Promise<T> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new MoltverseError(
        `HTTP ${res.status.toString()}: non-JSON response`,
        'SERVER_ERROR',
        res.status,
      );
    }
    if (!res.ok) {
      const err = body as ErrorResponseBody;
      const code = err.code ?? 'SERVER_ERROR';
      const message = err.error ?? `HTTP ${res.status.toString()}`;
      throw new MoltverseError(message, code, res.status);
    }
    return body as T;
  }
}
