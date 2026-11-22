import { API_URL } from './config.js';

const base = API_URL.replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message;
    throw new Error(Array.isArray(detail) ? detail.join('; ') : detail || `Ошибка API: ${response.status}`);
  }
  return body;
}

export const api = {
  async documents() { return request('/documents'); },
  async upload(file) {
    const body = new FormData();
    body.append('file', file);
    return request('/documents', { method: 'POST', body });
  },
  async waitDocument(id, status, signal) {
    const query = new URLSearchParams({ status, timeoutMs: '25000' });
    return request(`/documents/${encodeURIComponent(id)}/wait?${query}`, { signal });
  },
  async source(id) {
    const result = await request(`/documents/${encodeURIComponent(id)}/source`);
    return result.url;
  },
  async observations(filters = {}) {
    const records = [];
    for (let skip = 0; ; skip += 500) {
      const query = new URLSearchParams({ ...filters, skip: String(skip), take: '500' });
      const page = await request(`/observations?${query}`);
      records.push(...page);
      if (page.length < 500) return records;
    }
  },
  async ocr(file) {
    const body = new FormData();
    body.append('file', file);
    return request('/debug/ocr', { method: 'POST', body });
  },
  async llm(text) {
    return request('/debug/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  },
  async reportPlan(message) {
    return request('/chat/report-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
  },
  async rag(query) {
    return request('/debug/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  },
};
