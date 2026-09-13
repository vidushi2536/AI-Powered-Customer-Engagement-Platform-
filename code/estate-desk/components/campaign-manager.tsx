'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, MessageCircle, Play, RefreshCw, ShieldCheck } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  status: string;
  contactCount: number;
  propertyCount: number;
};

type Handoff = {
  id: string;
  phone: string;
  displayName: string | null;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

type RawMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'system';
  body: string;
  occurredAt: string;
};

type Requirements = {
  extraction_status: string;
  rooms_needed: number | null;
  property_type: string | null;
  preferred_locations: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  move_in_date: string | null;
  required_features: string[];
  preferred_features: string[];
  missing_fields: string[];
  confidence: Record<string, number>;
  summary: string;
} | null;

type Match = {
  rank: number;
  score: number;
  isHot: number;
  propertyId: string;
  address: string;
  location: string;
  price: number;
  bedrooms: number;
  matchReasons: string[];
  unmetRequirements: string[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [requirements, setRequirements] = useState<Requirements>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  async function loadCampaigns() {
    try {
      setError(null);
      const data = await getJson<{ campaigns: Campaign[] }>('/api/campaigns');
      setCampaigns(data.campaigns);
      if (!campaignId && data.campaigns[0]) setCampaignId(data.campaigns[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load campaigns');
    }
  }

  async function loadHandoffs(id: string) {
    if (!id) return;
    try {
      setError(null);
      const data = await getJson<{ handoffs: Handoff[] }>(`/api/campaigns/${id}/handoffs`);
      setHandoffs(data.handoffs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the handoff queue');
    }
  }

  async function openConversation(phone: string) {
    setSelectedPhone(phone);
    setLoading(true);
    setError(null);
    try {
      const [msgs, req, matchData] = await Promise.all([
        getJson<{ messages: RawMessage[] }>(
          `/api/campaigns/${campaignId}/messages?phone=${encodeURIComponent(phone)}`,
        ),
        getJson<{ requirements: Requirements }>(
          `/api/campaigns/${campaignId}/contacts/${encodeURIComponent(phone)}/requirements`,
        ),
        getJson<{ matches: Match[] }>(
          `/api/campaigns/${campaignId}/contacts/${encodeURIComponent(phone)}/matches`,
        ),
      ]);
      setMessages(msgs.messages);
      setRequirements(req.requirements);
      setMatches(matchData.matches);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the conversation');
    } finally {
      setLoading(false);
    }
  }

  async function resumeAgent(phone: string) {
    setResuming(true);
    setError(null);
    try {
      await fetch(`/api/campaigns/${campaignId}/contacts/${encodeURIComponent(phone)}/resume-agent`, {
        method: 'POST',
      });
      await loadHandoffs(campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume the agent');
    } finally {
      setResuming(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (campaignId) void loadHandoffs(campaignId);
    setSelectedPhone(null);
    setMessages([]);
    setRequirements(null);
    setMatches([]);
  }, [campaignId]);

  return (
    <div className="lead-layout">
      <aside className="panel lead-list">
        <div className="section-head">
          <div className="eyebrow">Campaign</div>
          <button className="btn small" onClick={() => void loadHandoffs(campaignId)}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {campaigns.length ? (
          <select
            style={{ width: '100%', padding: 8, borderRadius: 8 }}
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.contactCount} contacts
              </option>
            ))}
          </select>
        ) : (
          <p>No campaigns yet. Create one via the campaigns API.</p>
        )}

        <div className="eyebrow" style={{ marginTop: 24 }}>
          Handoff queue - {handoffs.filter((h) => h.status !== 'resolved').length} pending
        </div>
        {handoffs.length === 0 ? (
          <div className="empty">
            <ShieldCheck />
            <p>No handoffs yet for this campaign.</p>
          </div>
        ) : (
          handoffs.map((h) => (
            <button
              key={h.id}
              className={`selected-lead ${selectedPhone === h.phone ? 'active' : ''}`}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => void openConversation(h.phone)}
            >
              <strong>{h.displayName || h.phone}</strong>
              <p>{h.reason}</p>
              <span className={`badge ${h.status === 'resolved' ? 'good' : ''}`}>{h.status}</span>
            </button>
          ))
        )}
      </aside>

      <section className="panel chat-panel">
        <div className="section-head">
          <div>
            <h2>WhatsApp transcript</h2>
            <p>Immutable raw conversation record</p>
          </div>
        </div>
        <div className="transcript">
          {!selectedPhone ? (
            <div className="empty">
              <MessageCircle />
              <h3>Select a handoff</h3>
              <p>Pick a customer from the handoff queue to review their conversation.</p>
            </div>
          ) : loading ? (
            <p>Loading...</p>
          ) : (
            messages.map((m) => (
              <div className={`bubble ${m.direction === 'inbound' ? 'buyer' : ''}`} key={m.id}>
                <span className="bubble-label">
                  {m.direction === 'inbound' ? 'CUSTOMER' : m.direction === 'outbound' ? 'AGENT' : 'SYSTEM'}
                </span>
                <p>{m.body}</p>
                <time>{new Date(m.occurredAt).toLocaleString()}</time>
              </div>
            ))
          )}
        </div>
        {error && (
          <div className="notice row">
            <AlertTriangle size={17} /> {error}
          </div>
        )}
      </section>

      <aside className="panel dark brief-panel">
        <div>
          <div className="eyebrow">Structured summary</div>
          {!requirements ? (
            <p>No structured requirements yet for this customer.</p>
          ) : (
            <>
              <p>{requirements.summary}</p>
              <dl className="brief-list">
                <div>
                  <dt>Missing fields</dt>
                  <dd>{requirements.missing_fields.length ? requirements.missing_fields.join(', ') : 'None'}</dd>
                </div>
                <div>
                  <dt>Budget confidence</dt>
                  <dd>{describeConfidence(requirements.confidence.budgetMax)}</dd>
                </div>
                <div>
                  <dt>Location confidence</dt>
                  <dd>{describeConfidence(requirements.confidence.preferredLocations)}</dd>
                </div>
              </dl>
            </>
          )}

          <div className="eyebrow" style={{ marginTop: 20 }}>
            Top matches
          </div>
          {matches.length === 0 ? (
            <p>No property matches yet.</p>
          ) : (
            matches.map((m) => (
              <div key={m.propertyId} className="evidence" style={{ marginBottom: 10 }}>
                <strong>
                  #{m.rank} {m.address} {m.isHot ? '- [Hot] Hot' : ''}
                </strong>
                <p>
                  {m.bedrooms} bed - {m.location} - {m.price} - score {m.score}
                </p>
                <cite>{m.matchReasons.join(' - ') || m.unmetRequirements.join(' - ')}</cite>
              </div>
            ))
          )}
        </div>

        {selectedPhone && (
          <button className="btn light" disabled={resuming} onClick={() => void resumeAgent(selectedPhone)}>
            <Play size={16} /> {resuming ? 'Resuming...' : 'Resume AI agent'}
          </button>
        )}
      </aside>
    </div>
  );
}

function describeConfidence(value: number | undefined): string {
  if (value == null) return 'Missing';
  if (value >= 0.8) return 'High';
  if (value >= 0.5) return 'Medium';
  return 'Low';
}
