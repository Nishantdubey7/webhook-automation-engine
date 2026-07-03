const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000';

async function request(path: string, tenantSlug: string | null, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  listTenants: () => request('/tenants', null),
  createTenant: (data: any) => request('/tenants', null, { method: 'POST', body: JSON.stringify(data) }),

  listEvents: (tenantSlug: string) => request('/webhooks', tenantSlug),

  listJobs: (tenantSlug: string, status?: string) =>
    request(`/jobs${status ? `?status=${status}` : ''}`, tenantSlug),
  replayJob: (tenantSlug: string, jobId: string) =>
    request(`/jobs/${jobId}/replay`, tenantSlug, { method: 'POST' }),

  listRules: (tenantSlug: string) => request('/rules', tenantSlug),
  createRule: (tenantSlug: string, rule: any) =>
    request('/rules', tenantSlug, { method: 'POST', body: JSON.stringify(rule) }),
  toggleRule: (tenantSlug: string, ruleId: string, enabled: boolean) =>
    request(`/rules/${ruleId}`, tenantSlug, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  deleteRule: (tenantSlug: string, ruleId: string) =>
    request(`/rules/${ruleId}`, tenantSlug, { method: 'DELETE' }),
};
