import { env } from '../config/env';

interface ElasticsearchResponse {
  hits: {
    total: number | { value: number };
    hits: Array<{ _id: string; _source: Record<string, unknown> }>;
  };
}

function authHeaders(): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(env.ELASTICSEARCH_API_KEY ? { authorization: `ApiKey ${env.ELASTICSEARCH_API_KEY}` } : {}),
  };
}


export async function ensureEmailIndex(): Promise<void> {
  const url = `${env.ELASTICSEARCH_URL}/${env.ELASTICSEARCH_INDEX}`;
  const exists = await fetch(url, { method: 'HEAD', headers: authHeaders() });
  if (exists.ok) return;
  if (exists.status !== 404) throw new Error(`Elasticsearch index check failed (${exists.status})`);
  const created = await fetch(url, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          sender: { type: 'keyword' },
          recipient: { type: 'keyword' },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          indexedAt: { type: 'date' },
        },
      },
    }),
  });
  if (!created.ok && created.status !== 400) throw new Error(`Elasticsearch index creation failed (${created.status}): ${await created.text()}`);
}

export async function indexEmail(email: {
  id: string;
  userId: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt: Date | null;
}): Promise<void> {
  const response = await fetch(`${env.ELASTICSEARCH_URL}/${env.ELASTICSEARCH_INDEX}/_doc/${encodeURIComponent(email.id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      ...email,
      scheduledAt: email.scheduledAt.toISOString(),
      sentAt: email.sentAt?.toISOString() ?? null,
      indexedAt: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Elasticsearch indexing failed (${response.status}): ${await response.text()}`);
}

export async function searchEmails(userId: string, query: string, limit = 25) {
  const response = await fetch(`${env.ELASTICSEARCH_URL}/${env.ELASTICSEARCH_INDEX}/_search`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      size: Math.min(Math.max(limit, 1), 100),
      query: {
        bool: {
          filter: [{ term: { userId } }],
          must: [{ multi_match: { query, fields: ['recipient', 'sender', 'subject', 'body'], type: 'best_fields' } }],
        },
      },
      sort: [{ scheduledAt: 'desc' }],
    }),
  });
  if (!response.ok) throw new Error(`Elasticsearch search failed (${response.status}): ${await response.text()}`);
  const result = await response.json() as ElasticsearchResponse;
  return {
    total: typeof result.hits.total === 'number' ? result.hits.total : result.hits.total.value,
    data: result.hits.hits.map((hit) => ({ id: hit._id, ...hit._source })),
  };
}
