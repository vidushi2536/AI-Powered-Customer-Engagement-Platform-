'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  GitCompare,
  FileSpreadsheet,
  Home,
  House,
  LogOut,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  normalisePhone,
  type Contact,
  type LeadInsight,
  type Property,
  type Workspace,
  type WorkspaceInsights,
} from '@/lib/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Section =
  | 'onboarding'
  | 'dashboard'
  | 'clients'
  | 'properties'
  | 'meetings';
type Stats = {
  contacts: number;
  catalog: number;
  activeLeads: number;
  totalMessages: number;
  followUps: number;
  optedOut: number;
  qualified: number;
  responseCoverage: number;
  statusCounts: Record<string, number>;
  lastActivity: string | null;
};
type WorkspaceResult = {
  state?: Workspace;
  stats?: Stats;
  insights?: WorkspaceInsights;
  error?: string;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quote.');
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseContacts(text: string): Contact[] {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The CRM CSV is empty.');
  const first = rows[0].map((cell) =>
    cell.toLowerCase().replace(/[^a-z]/g, ''),
  );
  const hasHeader = first.some((cell) =>
    ['phone', 'phonenumber', 'mobile'].includes(cell),
  );
  const headers = hasHeader ? first : ['phone', 'name', 'consent'];
  const data = hasHeader ? rows.slice(1) : rows;
  const phoneIndex = Math.max(
    0,
    headers.findIndex((header) =>
      ['phone', 'phonenumber', 'mobile'].includes(header),
    ),
  );
  const nameIndex = headers.findIndex((header) => header === 'name');
  const consentIndex = headers.findIndex((header) =>
    ['consent', 'optedin', 'permission'].includes(header),
  );
  return data.map((row, index) => {
    const phone = normalisePhone(row[phoneIndex] || '');
    if (!/^\+\d{10,15}$/.test(phone))
      throw new Error(`CRM row ${index + 1}: invalid phone number.`);
    const raw = (consentIndex >= 0 ? row[consentIndex] : '').toLowerCase();
    const consent: Contact['consent'] = [
      'yes',
      'true',
      '1',
      'opted-in',
      'optedin',
    ].includes(raw)
      ? 'opted-in'
      : raw === 'opted-out'
        ? 'opted-out'
        : 'inbound-only';
    return {
      phone,
      name:
        nameIndex >= 0 && row[nameIndex]
          ? row[nameIndex].slice(0, 80)
          : `Contact ${index + 1}`,
      consent,
      addedAt: new Date().toISOString(),
    };
  });
}

function parseProperties(text: string): Array<Partial<Property>> {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The listings CSV has no data rows.');
  const headers = rows[0].map((cell) =>
    cell.toLowerCase().replace(/[^a-z]/g, ''),
  );
  const at = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));
  const locationIndex = at('location', 'address');
  const sectorIndex = at('sector');
  const bedroomsIndex = at('bedrooms', 'bedroom', 'bedroomcount');
  const sqftIndex = at('sqft', 'area');
  const priceLakhsIndex = at('pricelakhs');
  const priceIndex = at('price');
  if (
    (locationIndex < 0 && sectorIndex < 0) ||
    bedroomsIndex < 0 ||
    sqftIndex < 0 ||
    (priceLakhsIndex < 0 && priceIndex < 0)
  )
    throw new Error(
      'Listings need location/sector, bedrooms, sqft/area and price_lakhs/price columns.',
    );
  return rows.slice(1).map((row, index) => {
    const location =
      locationIndex >= 0 && row[locationIndex]
        ? row[locationIndex]
        : `Sector ${row[sectorIndex]}, Gurugram`;
    const property = {
      location,
      bedrooms: Number(row[bedroomsIndex]),
      sqft: Number(row[sqftIndex]),
      priceLakhs:
        priceLakhsIndex >= 0
          ? Number(row[priceLakhsIndex])
          : Number(row[priceIndex]) * 100,
    };
    if (
      !property.location ||
      ![property.bedrooms, property.sqft, property.priceLakhs].every(
        Number.isFinite,
      )
    )
      throw new Error(`Property row ${index + 1}: invalid listing values.`);
    return property;
  });
}

function price(value: number) {
  return value >= 100
    ? `₹${(value / 100).toFixed(value % 100 ? 1 : 0)} Cr`
    : `₹${value} L`;
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadLeadData(state: Workspace, insights: WorkspaceInsights) {
  const headings = [
    'record_type',
    'lead_name',
    'phone',
    'status',
    'profile_completeness',
    'requirements',
    'recommended_property_ids',
    'message_role',
    'message_text',
    'message_time',
  ];
  const rows: Array<Array<string | number | null | undefined>> = [headings];
  for (const insight of insights.leads) {
    rows.push([
      'agent_insight',
      insight.name,
      insight.phone,
      insight.status,
      `${insight.readiness}%`,
      insight.summary,
      insight.recommendations.map((item) => item.property.id).join(' | '),
      '',
      '',
      insight.updatedAt,
    ]);
    const lead = (state.leads || []).find(
      (item) => item.phone === insight.phone,
    );
    for (const message of lead?.messages || []) {
      rows.push([
        'whatsapp_message',
        insight.name,
        insight.phone,
        insight.status,
        `${insight.readiness}%`,
        insight.summary,
        insight.recommendations.map((item) => item.property.id).join(' | '),
        message.role,
        message.text,
        message.at,
      ]);
    }
  }
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `estate-desk-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ManagerHeader({
  section,
  state,
  signOut,
}: {
  section: Section;
  state: Workspace;
  signOut: () => void;
}) {
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const needle = search.trim().toLowerCase();
  const results = needle
    ? [
        ...(state.leads || []).map((lead) => ({
          href: `/clients?phone=${encodeURIComponent(lead.phone)}`,
          title: lead.name,
          detail: `${lead.phone} · ${lead.status}`,
          haystack: `${lead.name} ${lead.phone} ${lead.status}`.toLowerCase(),
        })),
        ...state.properties.map((property) => ({
          href: `/properties?id=${encodeURIComponent(property.id)}`,
          title: property.id,
          detail: `${property.location} · ${property.bedrooms} BHK`,
          haystack:
            `${property.id} ${property.location} ${property.society || ''}`.toLowerCase(),
        })),
      ]
        .filter((item) => item.haystack.includes(needle))
        .slice(0, 7)
    : [];
  const links = [
    {
      href: '/dashboard',
      label: 'Today',
      icon: Home,
      key: 'dashboard',
      detail: 'Priorities and live activity',
    },
    {
      href: '/clients',
      label: 'Leads & clients',
      icon: Users,
      key: 'clients',
      detail: 'Conversations and next steps',
    },
    {
      href: '/properties',
      label: 'Properties & insights',
      icon: House,
      key: 'properties',
      detail: 'Demand and verified listings',
    },
    {
      href: '/meetings',
      label: 'Meetings',
      icon: CalendarDays,
      key: 'meetings',
      detail: 'Visits, timing and confirmation',
    },
  ] as const;
  return (
    <header className="manager-header">
      <Link className="manager-brand" href="/dashboard" aria-label="Estate Desk home">
        <span className="manager-brand-mark">
          <Building2 size={19} />
        </span>
        <span className="manager-brand-copy">
          <strong>Estate Desk</strong>
          <small>Property intelligence</small>
        </span>
      </Link>
      <nav className="manager-primary-nav" aria-label="Workspace navigation">
        {links.map(({ href, label, icon: Icon, key }) => (
          <Link
            href={href}
            className={section === key ? 'active' : ''}
            aria-current={section === key ? 'page' : undefined}
            key={key}
          >
            <span>
              <Icon />
            </span>
            <strong>{label}</strong>
          </Link>
        ))}
      </nav>
      <div className="global-search">
        <Search />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && setSearch('')}
          placeholder="Search buyers, phones, sectors, property IDs"
          aria-label="Search the entire workspace"
        />
        {needle && (
          <div
            className="search-results"
            aria-label="Workspace search results"
          >
            {results.length ? (
              results.map((item) => (
                <Link
                  href={item.href}
                  key={`${item.href}-${item.title}`}
                  onClick={() => setSearch('')}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </Link>
              ))
            ) : (
              <p>No buyers or verified properties found.</p>
            )}
          </div>
        )}
      </div>
      <div className="manager-header-actions">
        <button
          className="icon-button"
          aria-label="Notifications"
          aria-expanded={notificationsOpen}
          onClick={() => setNotificationsOpen((open) => !open)}
        >
          <Bell />
        </button>
        <button className="header-account" onClick={signOut} aria-label="Sign out">
          <LogOut />
          <span>Sign out</span>
        </button>
      </div>
      {notificationsOpen && (
        <div className="notification-popover">
          <strong>Your reminders</strong>
          <p>
            {(state.leads || []).filter((lead) => lead.meeting).length
              ? `${(state.leads || []).filter((lead) => lead.meeting).length} viewing request needs your review.`
              : 'No viewing requests need review.'}
          </p>
          <Link href="/meetings" onClick={() => setNotificationsOpen(false)}>
            Open meetings <ArrowRight />
          </Link>
        </div>
      )}
    </header>
  );
}

export default function WorkspaceApp({ section }: { section: Section }) {
  const searchParams = useSearchParams();
  const requestedPhone = searchParams.get('phone') || '';
  const [state, setState] = useState<Workspace | null>(null);
  const [insights, setInsights] = useState<WorkspaceInsights | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<Array<Partial<Property>> | null>(
    null,
  );
  const [crmName, setCrmName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [modal, setModal] = useState<'clients' | 'properties' | null>(null);
  const [query, setQuery] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [linkingMessage, setLinkingMessage] = useState('');
  const [clientForm, setClientForm] = useState({
    name: '',
    phone: '',
    consent: 'inbound-only' as Contact['consent'],
  });
  const [propertyForm, setPropertyForm] = useState({
    location: '',
    bedrooms: '',
    sqft: '',
    priceLakhs: '',
  });
  const crmInput = useRef<HTMLInputElement>(null);
  const propertyInput = useRef<HTMLInputElement>(null);
  const addCrmInput = useRef<HTMLInputElement>(null);
  const addPropertyInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (section === 'clients') setSelectedPhone(requestedPhone);
  }, [section, requestedPhone]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace', { cache: 'no-store' });
      const result = (await response.json()) as WorkspaceResult;
      if (response.status === 401) return window.location.replace('/');
      if (!response.ok || !result.state)
        throw new Error(result.error || 'Could not load workspace.');
      setLoadError('');
      setState(result.state || null);
      setInsights(result.insights || null);
      if (result.state?.ownerPhone)
        setOwnerPhone(result.state.ownerPhone.replace(/^\+/, ''));
      if (section === 'onboarding' && result.state?.contacts?.length) {
        setContacts(result.state.contacts);
        setCrmName('saved CRM');
        setConfirmed(true);
        if (!result.state.onboardingComplete) {
          const statusResponse = await fetch('/api/whatsapp/openclaw/status', {
            cache: 'no-store',
          });
          if (statusResponse.ok) {
            const whatsappStatus = (await statusResponse.json()) as {
              connected?: boolean;
            };
            if (whatsappStatus.connected) {
              window.location.replace('/dashboard');
              return;
            }
          }
        }
      }
      if (section !== 'onboarding' && !result.state?.onboardingComplete)
        window.location.replace('/onboarding');
    } catch (reason) {
      setLoadError(
        reason instanceof Error ? reason.message : 'Could not load workspace.',
      );
    }
  }, [section]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    let source: EventSource | undefined;
    let fallback: number | undefined;
    if (section !== 'onboarding') {
      source = new EventSource('/api/workspace/stream');
      source.onopen = () => setLiveConnected(true);
      source.onmessage = (event) => {
        const result = JSON.parse(event.data) as WorkspaceResult;
        setState(result.state || null);
        setInsights(result.insights || null);
        if (result.state) setLoadError('');
        setLiveConnected(true);
      };
      source.onerror = () => {
        setLiveConnected(false);
        if (!fallback) fallback = window.setInterval(() => void load(), 5000);
      };
    }
    return () => {
      window.clearTimeout(initial);
      source?.close();
      if (fallback) window.clearInterval(fallback);
    };
  }, [load, section]);

  const visibleLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return insights?.leads || [];
    return (insights?.leads || []).filter((lead) =>
      [lead.name, lead.phone, lead.status, lead.summary].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [insights, query]);
  const selectedLead =
    (insights?.leads || []).find((lead) => lead.phone === selectedPhone) ||
    (query.trim() && visibleLeads.length === 1 ? visibleLeads[0] : undefined);

  async function readFile(
    file: File,
    kind: 'crm' | 'properties',
    additive = false,
  ) {
    setError('');
    setNotice('');
    try {
      if (file.size > 1_500_000)
        throw new Error('Choose a CSV smaller than 1.5 MB.');
      const text = await file.text();
      if (kind === 'crm') {
        const parsed = parseContacts(text);
        if (parsed.length > (additive ? 100 : 500))
          throw new Error(`Use up to ${additive ? 100 : 500} contacts.`);
        setContacts(parsed);
        setCrmName(file.name);
      } else {
        const parsed = parseProperties(text);
        if (parsed.length > (additive ? 100 : 500))
          throw new Error(`Use up to ${additive ? 100 : 500} listings.`);
        setProperties(parsed);
        setPropertyName(file.name);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not read CSV.',
      );
    }
  }

  async function post(body: object, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as WorkspaceResult;
      if (!response.ok)
        throw new Error(result.error || 'Could not update workspace.');
      setState(result.state || null);
      setInsights(result.insights || null);
      setNotice(success);
      setModal(null);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not update workspace.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finishOnboarding() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'onboarding',
          ownerPhone,
          contacts,
          properties,
          consentConfirmed: confirmed,
        }),
      });
      const result = (await response.json()) as WorkspaceResult;
      if (!response.ok)
        throw new Error(result.error || 'Could not finish setup.');
      setState(result.state || null);
      setLinkingMessage('Creating your private WhatsApp agent…');
      const startResponse = await fetch('/api/whatsapp/openclaw/start', {
        method: 'POST',
      });
      const start = (await startResponse.json()) as {
        qrDataUrl?: string;
        sessionKey?: string;
        connected?: boolean;
        error?: string;
        message?: string;
      };
      if (!startResponse.ok)
        throw new Error(start.error || 'Could not start WhatsApp linking.');
      if (start.connected) {
        window.location.assign('/dashboard');
        return;
      }
      if (!start.qrDataUrl)
        throw new Error(start.message || 'WhatsApp did not provide a QR code.');
      setQrDataUrl(start.qrDataUrl);
      setLinkingMessage('Scan this QR with your WhatsApp account.');
      await waitForWhatsAppLink(start.qrDataUrl, start.sessionKey || '');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not finish setup.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function waitForWhatsAppLink(
    initialQrDataUrl: string,
    initialSessionKey: string,
  ) {
    let currentQrDataUrl = initialQrDataUrl;
    let sessionKey = initialSessionKey;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await fetch('/api/whatsapp/openclaw/wait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentQrDataUrl, sessionKey }),
      });
      const result = (await response.json()) as {
        connected?: boolean;
        qrDataUrl?: string;
        sessionKey?: string;
        phone?: string;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        const statusResponse = await fetch('/api/whatsapp/openclaw/status', {
          cache: 'no-store',
        });
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as {
            connected?: boolean;
          };
          if (status.connected) {
            window.location.assign('/dashboard');
            return;
          }
        }
        throw new Error(result.error || 'WhatsApp linking failed.');
      }
      if (result.connected) {
        setLinkingMessage(`Connected ${result.phone || 'WhatsApp'}. Opening dashboard…`);
        window.location.assign('/dashboard');
        return;
      }
      if (result.qrDataUrl) {
        currentQrDataUrl = result.qrDataUrl;
        setQrDataUrl(result.qrDataUrl);
      }
      if (result.sessionKey) {
        sessionKey = result.sessionKey;
      }
      setLinkingMessage(result.message || 'Waiting for the QR scan…');
    }
    throw new Error('WhatsApp linking timed out. Generate a fresh QR and try again.');
  }

  async function addClient(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = normalisePhone(clientForm.phone);
    const added = await post(
      {
        action: 'addContacts',
        contacts: [{ ...clientForm, phone }],
        consentConfirmed: confirmed,
      },
      'Client added to the CRM allowlist.',
    );
    if (added) {
      setClientForm({ name: '', phone: '', consent: 'inbound-only' });
      setConfirmed(false);
    }
  }

  async function addProperty(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const added = await post(
      {
        action: 'addProperties',
        properties: [
          {
            location: propertyForm.location,
            bedrooms: Number(propertyForm.bedrooms),
            sqft: Number(propertyForm.sqft),
            priceLakhs: Number(propertyForm.priceLakhs),
          },
        ],
      },
      'Property added to the catalog.',
    );
    if (added)
      setPropertyForm({ location: '', bedrooms: '', sqft: '', priceLakhs: '' });
  }

  async function signOut() {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.assign('/');
  }

  if (!state)
    return (
      <main className="setup-loading">
        <div className="setup-load-message">
          <p role="status" aria-live="polite" aria-atomic="true">
            {loadError || 'Preparing your workspace…'}
          </p>
          {loadError && (
            <button className="primary-action" onClick={() => void load()}>
              <RefreshCw size={17} /> Retry
            </button>
          )}
        </div>
      </main>
    );

  if (section === 'onboarding')
    return (
      <main className="setup-shell">
        <header className="setup-header">
          <a className="landing-brand" href="/">
            <span>
              <Building2 size={19} />
            </span>
            Estate Desk
          </a>
          <p>Workspace setup</p>
        </header>
        <section className="setup-intro">
          <p className="eyebrow">One private workspace. One real WhatsApp agent.</p>
          <h1>Connect your WhatsApp.</h1>
          <p>
            Add your listings and contacts, then scan the QR. Your laptop runs
            the agent during this pilot.
          </p>
        </section>
        <section className="setup-cards">
          <article className="upload-card phone-setup-card">
            <div className="step-number">01</div>
            <MessageCircle size={23} />
            <h2>Your WhatsApp number</h2>
            <p>Used for your private workspace. Include the country code.</p>
            <label className="setup-phone-field" htmlFor="owner-phone">
              <span>+</span>
              <input
                id="owner-phone"
                value={ownerPhone}
                onChange={(event) =>
                  setOwnerPhone(
                    event.target.value.replace(/[^\d]/g, '').slice(0, 15),
                  )
                }
                inputMode="tel"
                autoComplete="tel"
                placeholder="91 98765 43210"
              />
            </label>
            <div
              className={
                ownerPhone.length >= 10 ? 'file-result' : 'file-result waiting'
              }
            >
              <CheckCircle2 size={17} />
              {ownerPhone.length >= 10
                ? 'We’ll verify this after the QR scan'
                : 'WhatsApp number required'}
            </div>
          </article>
          <article className="upload-card">
            <div className="step-number">02</div>
            <Database size={23} />
            <h2>Property listings</h2>
            <p>Use the sample listings or upload your own CSV.</p>
            <input
              ref={propertyInput}
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                event.target.files?.[0] &&
                void readFile(event.target.files[0], 'properties')
              }
            />
            <button
              className="upload-button"
              onClick={() => propertyInput.current?.click()}
            >
              <UploadCloud size={17} />
              Upload listings CSV
            </button>
            <a href="/property-template.csv" download>
              <Download size={15} />
              Download template
            </a>
            <div className="file-result">
              <CheckCircle2 size={17} />
              {properties
                ? `${properties.length} listings from ${propertyName}`
                : `${state.properties.length} included sample listings`}
            </div>
          </article>
          <article className="upload-card">
            <div className="step-number">03</div>
            <Users size={23} />
            <h2>CRM contacts</h2>
            <p>Upload phone numbers. Names and consent are optional.</p>
            <input
              ref={crmInput}
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) =>
                event.target.files?.[0] &&
                void readFile(event.target.files[0], 'crm')
              }
            />
            <button
              className="upload-button"
              onClick={() => crmInput.current?.click()}
            >
              <UploadCloud size={17} />
              Upload CRM CSV
            </button>
            <a href="/crm-template.csv" download>
              <Download size={15} />
              Download template
            </a>
            <div
              className={
                contacts.length ? 'file-result' : 'file-result waiting'
              }
            >
              <CheckCircle2 size={17} />
              {contacts.length
                ? `${contacts.length} contacts from ${crmName}`
                : 'CRM file required'}
            </div>
          </article>
          <article className="upload-card whatsapp-link-card">
            <div className="step-number">04</div>
            <QrCode size={23} />
            <h2>Link WhatsApp</h2>
            <p>On your phone, open Linked devices and scan this QR.</p>
            {qrDataUrl ? (
              <div className="whatsapp-qr-wrap">
                <Image
                  src={qrDataUrl}
                  alt="WhatsApp Linked Devices QR code"
                  width={280}
                  height={280}
                  unoptimized
                />
                <strong role="status" aria-live="polite" aria-atomic="true">
                  {linkingMessage}
                </strong>
                <small>Keep this page open until the connection is confirmed.</small>
              </div>
            ) : (
              <div className="file-result waiting">
                <QrCode size={17} />
                QR appears after your data is saved
              </div>
            )}
          </article>
        </section>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            <strong>I am authorised to store these contacts.</strong> Estate
            Desk will not cold-message uploaded numbers. Inbound-only contacts
            must message first; STOP always opts them out.
          </span>
        </label>
        {(error || loadError) && (
          <p
            className="setup-error"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {error || loadError}
          </p>
        )}
        <div className="setup-actions">
          <button
            className="finish-button"
            disabled={
              busy || ownerPhone.length < 10 || !contacts.length || !confirmed
            }
            onClick={() => void finishOnboarding()}
          >
            {busy
              ? qrDataUrl
                ? 'Waiting for WhatsApp…'
                : 'Creating real agent…'
              : 'Save and connect WhatsApp'}
            <ArrowRight size={18} />
          </button>
        </div>
      </main>
    );

  const pageTitles = {
    dashboard: [
      'Good to see you',
      'Your day',
      'Your action queue, upcoming viewings and next priorities.',
    ],
    clients: [
      'Lead pipeline',
      'Leads & clients.',
      'Review active leads first, then open any client for their history and next action.',
    ],
    properties: [
      'Catalog and demand intelligence',
      'Property intelligence.',
      'See what buyers want, then browse verified listings ranked by real demand.',
    ],
    meetings: [
      'Visits and appointments',
      'Meetings.',
      'See every proposed, confirmed and completed property visit in one schedule.',
    ],
  } as const;
  const [eyebrow, title, subtitle] = pageTitles[section];

  return (
    <main className={`stats-shell manager-shell section-${section}`}>
      <ManagerHeader
        section={section}
        state={state}
        signOut={() => void signOut()}
      />
      <section className="manager-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div
          className={liveConnected ? 'live-status connected' : 'live-status'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <i /> {liveConnected ? 'Live updates connected' : 'Reconnecting…'}
          <button aria-label="Refresh now" onClick={() => void load()}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>
      {(error || loadError) && (
        <p
          className="setup-error"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {error || loadError}
        </p>
      )}
      {notice && (
        <p
          className="success-notice"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <CheckCircle2 size={17} />
          {notice}
        </p>
      )}

      {section === 'dashboard' && (
        <Overview
          state={state}
          insights={insights}
        />
      )}
      {section === 'clients' && (
        <LeadsDashboard
          state={state}
          insights={insights}
          leads={visibleLeads}
          selected={selectedLead}
          query={query}
          setQuery={setQuery}
          select={setSelectedPhone}
          post={post}
          openModal={() => setModal('clients')}
        />
      )}
      {section === 'properties' && (
        <PropertiesDashboard
          state={state}
          insights={insights}
          openModal={() => setModal('properties')}
        />
      )}
      {section === 'meetings' && <ViewingDesk state={state} post={post} />}

      <footer className="stats-footer">
        Insights are derived from this workspace’s customer messages and
        uploaded listing data. Verify availability before committing to a
        viewing.
      </footer>

      <Dialog
        open={modal === 'clients'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="manager-dialog">
          <DialogHeader>
            <DialogTitle>Add new clients</DialogTitle>
            <DialogDescription>
              Add one client or upload a CRM CSV. Numbers join this
              workspace&apos;s WhatsApp allowlist.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="form">
            <TabsList className="modal-tabs">
              <TabsTrigger value="form">
                <UserPlus />
                Form
              </TabsTrigger>
              <TabsTrigger value="csv">
                <FileSpreadsheet />
                CSV upload
              </TabsTrigger>
            </TabsList>
            <TabsContent value="form">
              <form className="manager-form" onSubmit={addClient}>
                <label>
                  Name
                  <input
                    required
                    value={clientForm.name}
                    onChange={(event) =>
                      setClientForm({ ...clientForm, name: event.target.value })
                    }
                    placeholder="Client name"
                  />
                </label>
                <label>
                  Phone number
                  <input
                    required
                    value={clientForm.phone}
                    onChange={(event) =>
                      setClientForm({
                        ...clientForm,
                        phone: event.target.value,
                      })
                    }
                    placeholder="+91 77559 71789"
                  />
                </label>
                <label>
                  Contact permission
                  <select
                    value={clientForm.consent}
                    onChange={(event) =>
                      setClientForm({
                        ...clientForm,
                        consent: event.target.value as Contact['consent'],
                      })
                    }
                  >
                    <option value="inbound-only">Inbound only</option>
                    <option value="opted-in">Explicitly opted in</option>
                    <option value="opted-out">Opted out</option>
                  </select>
                </label>
                <label className="dialog-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>
                    I am authorised to store this contact and will follow their
                    selected permission.
                  </span>
                </label>
                <button
                  className="primary-action"
                  disabled={busy || !confirmed}
                >
                  {busy ? 'Adding…' : 'Add client'}
                </button>
              </form>
            </TabsContent>
            <TabsContent value="csv">
              <div className="csv-drop">
                <input
                  ref={addCrmInput}
                  hidden
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    event.target.files?.[0] &&
                    void readFile(event.target.files[0], 'crm', true)
                  }
                />
                <UploadCloud />
                <h3>Upload CRM contacts</h3>
                <p>Columns: phone, name, consent. Up to 100 rows per upload.</p>
                <button
                  className="secondary-action"
                  onClick={() => addCrmInput.current?.click()}
                >
                  Choose CSV
                </button>
                {contacts.length > 0 && (
                  <span>
                    {contacts.length} contacts ready from {crmName}
                  </span>
                )}
              </div>
              <label className="dialog-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I am authorised to store these contacts and will honor their
                  permissions.
                </span>
              </label>
              <button
                className="primary-action wide"
                disabled={busy || !contacts.length || !confirmed}
                onClick={async () => {
                  const count = contacts.length;
                  const added = await post(
                    {
                      action: 'addContacts',
                      contacts,
                      consentConfirmed: confirmed,
                    },
                    `${count} contacts added.`,
                  );
                  if (added) {
                    setContacts([]);
                    setCrmName('');
                    setConfirmed(false);
                    if (addCrmInput.current) addCrmInput.current.value = '';
                  }
                }}
              >
                {busy ? 'Adding…' : `Add ${contacts.length || ''} contacts`}
              </button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === 'properties'}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="manager-dialog">
          <DialogHeader>
            <DialogTitle>Add new properties</DialogTitle>
            <DialogDescription>
              Add one listing or append a listings CSV to the current catalog.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="form">
            <TabsList className="modal-tabs">
              <TabsTrigger value="form">
                <Plus />
                Form
              </TabsTrigger>
              <TabsTrigger value="csv">
                <FileSpreadsheet />
                CSV upload
              </TabsTrigger>
            </TabsList>
            <TabsContent value="form">
              <form className="manager-form" onSubmit={addProperty}>
                <label>
                  Location
                  <input
                    required
                    value={propertyForm.location}
                    onChange={(event) =>
                      setPropertyForm({
                        ...propertyForm,
                        location: event.target.value,
                      })
                    }
                    placeholder="Sector 57, Gurugram"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Bedrooms
                    <input
                      required
                      min="1"
                      type="number"
                      value={propertyForm.bedrooms}
                      onChange={(event) =>
                        setPropertyForm({
                          ...propertyForm,
                          bedrooms: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Area (sq ft)
                    <input
                      required
                      min="100"
                      type="number"
                      value={propertyForm.sqft}
                      onChange={(event) =>
                        setPropertyForm({
                          ...propertyForm,
                          sqft: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Price (₹ lakh)
                  <input
                    required
                    min="1"
                    step="0.1"
                    type="number"
                    value={propertyForm.priceLakhs}
                    onChange={(event) =>
                      setPropertyForm({
                        ...propertyForm,
                        priceLakhs: event.target.value,
                      })
                    }
                  />
                </label>
                <button className="primary-action" disabled={busy}>
                  {busy ? 'Adding…' : 'Add property'}
                </button>
              </form>
            </TabsContent>
            <TabsContent value="csv">
              <div className="csv-drop">
                <input
                  ref={addPropertyInput}
                  hidden
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    event.target.files?.[0] &&
                    void readFile(event.target.files[0], 'properties', true)
                  }
                />
                <UploadCloud />
                <h3>Upload property listings</h3>
                <p>
                  Columns: location, bedrooms, sqft, price_lakhs. Up to 100
                  rows.
                </p>
                <button
                  className="secondary-action"
                  onClick={() => addPropertyInput.current?.click()}
                >
                  Choose CSV
                </button>
                {properties && (
                  <span>
                    {properties.length} listings ready from {propertyName}
                  </span>
                )}
              </div>
              <button
                className="primary-action wide"
                disabled={busy || !properties?.length}
                onClick={() =>
                  void post(
                    { action: 'addProperties', properties },
                    `${properties?.length || 0} properties added.`,
                  )
                }
              >
                {busy
                  ? 'Adding…'
                  : `Add ${properties?.length || ''} properties`}
              </button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Overview({
  state,
  insights,
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
}) {
  const readyLeads = (insights?.leads || []).filter((lead) =>
    ['Follow up', 'Viewing proposed'].includes(lead.status),
  );
  const upcoming = (state.leads || [])
    .filter((lead) => lead.meeting)
    .sort((a, b) =>
      (a.meeting?.date || '').localeCompare(b.meeting?.date || ''),
    );
  const followUps = (insights?.leads || []).filter(
    (lead) =>
      lead.status !== 'Opted out' &&
      lead.messageCount > 0 &&
      !lead.recommendations.length,
  );
  const setup = [
    { label: 'CRM contacts imported', done: Boolean(state.contacts?.length) },
    {
      label: 'Property catalog loaded',
      done: Boolean(state.properties.length),
    },
    { label: 'WhatsApp agent connected', done: state.whatsapp?.connected === true },
  ];
  const incompleteSetup = setup.filter((item) => !item.done);
  return (
    <>
      <section className="page-action-bar" aria-label="Agent connection">
        <div>
          <MessageCircle />
          <span>
            {state.whatsapp?.connected
              ? "WhatsApp connected · " + (state.agentEnabled ? "Agent enabled" : "Agent paused")
              : "Connect your WhatsApp agent to find leads from conversations."}
          </span>
        </div>
        <Link className="secondary-action connection-action" href="/onboarding">
          <span>
            <strong>{state.whatsapp?.connected ? 'Manage WhatsApp' : 'Connect WhatsApp'}</strong>
            <small>{state.whatsapp?.connected ? 'Settings and agent status' : 'Link your number securely'}</small>
          </span>
          <ArrowRight />
        </Link>
      </section>
      <section
        className={
          incompleteSetup.length ? 'today-grid' : 'today-grid setup-complete'
        }
      >
        <article className="today-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">From your conversations</p>
              <h2>AI-found leads</h2>
            </div>
            <a href="/clients">View all</a>
          </div>
          {readyLeads.length ? (
            readyLeads.slice(0, 5).map((lead) => (
              <a
                className="today-row"
                href={`/clients?phone=${encodeURIComponent(lead.phone)}`}
                key={lead.phone}
              >
                <span>
                  <strong>{lead.name}</strong>
                  <small>{lead.nextAction}</small>
                </span>
                <ChevronRight />
              </a>
            ))
          ) : (
            <EmptyState
              title="No leads to review yet"
              text="Ready-for-viewing buyers will appear after WhatsApp conversations show clear property interest."
            />
          )}
        </article>
        <article className="today-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Physical meetings</p>
              <h2>Upcoming viewings</h2>
            </div>
            <a href="/clients">Open clients</a>
          </div>
          {upcoming.length ? (
            upcoming.slice(0, 5).map((lead) => (
              <a
                className="today-row"
                href={`/clients?phone=${encodeURIComponent(lead.phone)}`}
                key={lead.phone}
              >
                <span>
                  <strong>
                    {lead.meeting?.propertyId} · {lead.name}
                  </strong>
                  <small>{safeMeetingDate(lead.meeting?.date || '')}</small>
                </span>
                <em
                  className={`viewing-label ${lead.meeting?.status || 'proposed'}`}
                >
                  {formatViewingStatus(lead.meeting?.status)}
                </em>
                <ChevronRight />
              </a>
            ))
          ) : (
            <EmptyState
              title="No viewings scheduled"
              text="Schedule one from a grounded property shortlist when a buyer is ready."
            />
          )}
        </article>
        {incompleteSetup.length > 0 && (
          <article className="today-card" id="setup">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Finish setup</p>
                <h2>{incompleteSetup.length} {incompleteSetup.length === 1 ? 'task' : 'tasks'} remaining</h2>
              </div>
            </div>
            <ul className="setup-checklist">
              {incompleteSetup.map((item) => (
                <li key={item.label}>
                  <CircleAlert />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <a href="/onboarding">Continue setup <ArrowRight size={14} /></a>
          </article>
        )}
        <article className="today-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>Follow-up queue</h2>
            </div>
          </div>
          {followUps.length ? (
            followUps.slice(0, 4).map((lead) => (
              <a className="today-row" href="/clients" key={lead.phone}>
                <span>
                  <strong>{lead.name}</strong>
                  <small>
                    {lead.missing.join(', ') || 'Review conversation'}
                  </small>
                </span>
                <ChevronRight />
              </a>
            ))
          ) : (
            <EmptyState
              title="Queue is clear"
              text="Leads missing a grounded match or next step will appear here."
            />
          )}
        </article>
      </section>
    </>
  );
}

function LeadsDashboard({
  state,
  insights,
  leads,
  selected,
  query,
  setQuery,
  select,
  post,
  openModal,
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
  leads: LeadInsight[];
  selected?: LeadInsight;
  query: string;
  setQuery: (value: string) => void;
  select: (phone: string) => void;
  post: (body: object, success: string) => Promise<boolean>;
  openModal: () => void;
}) {
  const [filter, setFilter] = useState<
    'all' | 'ready' | 'follow-up' | 'no-match'
  >('all');
  const [propertyId, setPropertyId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const filteredLeads = leads.filter((lead) =>
    filter === 'all'
      ? true
      : filter === 'ready'
        ? ['Follow up', 'Viewing proposed'].includes(lead.status)
        : filter === 'follow-up'
          ? lead.messageCount > 0 && lead.status !== 'Opted out'
          : lead.status === 'No match',
  );
  const verifiedOptions = selected?.recommendations.length
    ? selected.recommendations.map((item) => item.property)
    : state.properties;
  const chosenProperty = propertyId || verifiedOptions[0]?.id || '';
  const buyer = (state.leads || []).find(
    (lead) => lead.phone === selected?.phone,
  );

  return (
    <>
      <section className="client-toolbar">
        <label className="lead-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads, clients or phone numbers"
            aria-label="Search leads and clients"
          />
        </label>
        {!selected && (
          <div className="saved-filters" aria-label="Saved lead filters">
            {(
              [
                ['all', 'All leads'],
                ['ready', 'Ready for viewing'],
                ['follow-up', 'Needs follow-up'],
                ['no-match', 'No match'],
              ] as const
            ).map(([value, label]) => (
              <button
                className={filter === value ? 'active' : ''}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <button
            className="back-to-leads"
            onClick={() => {
              select('');
              setQuery('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <ArrowLeft /> Back to leads
          </button>
        )}
        <button className="primary-action add-leads-action" onClick={openModal}>
          <UserPlus /> Add leads
        </button>
      </section>

      {!selected && (
        <section className="client-glance-grid" aria-label="Lead list">
          {filteredLeads.length ? (
            filteredLeads.map((lead) => (
              <button
                className="client-glance-card"
                key={lead.phone}
                aria-label={`Open ${lead.name || lead.phone}`}
                onClick={() => {
                  select(lead.phone);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <div className="client-identity">
                  <span>
                    <strong>{lead.name}</strong>
                    <small>{lead.phone}</small>
                  </span>
                  <span
                    className={`status-pill status-${lead.status.toLowerCase().replaceAll(' ', '-')}`}
                  >
                    {lead.status}
                  </span>
                </div>
                <div className="glance-item">
                  <span>Chat summary</span>
                  <p>{lead.summary}</p>
                </div>
                <div className="glance-item next">
                  <span>Next steps</span>
                  <p>{lead.nextAction}</p>
                </div>
              </button>
            ))
          ) : (
            <EmptyState
              title="No matching leads"
              text="Try another search or wait for an allowed WhatsApp contact to message."
            />
          )}
        </section>
      )}

      {selected && (
        <section className="client-action-panel">
          <header className="compact-client-header">
            <div>
              <p className="eyebrow">Client record</p>
              <h2>{selected.name}</h2>
              <a href={`tel:${selected.phone}`}>{selected.phone}</a>
            </div>
            <button
              className="export-button"
              disabled={!insights}
              onClick={() => insights && downloadLeadData(state, insights)}
            >
              <Download /> Download client data
            </button>
          </header>
          <div className="selected-client-summary">
            <article>
              <p className="eyebrow">Chat summary</p>
              <h3>{selected.summary}</h3>
            </article>
            <article>
              <p className="eyebrow">Next steps</p>
              <h3>{selected.nextAction}</h3>
            </article>
          </div>
          <section className="conversation-history">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Conversation history</p>
                <h3>Recent WhatsApp messages</h3>
              </div>
              <span>{buyer?.messages.length || 0} messages</span>
            </div>
            {buyer?.messages.length ? (
              <div className="history-list">
                {buyer.messages
                  .slice(-8)
                  .reverse()
                  .map((message) => (
                    <article
                      className={`history-message ${message.role}`}
                      key={message.id}
                    >
                      <div>
                        <strong>
                          {message.role === 'buyer'
                            ? selected.name
                            : 'Estate Desk AI'}
                        </strong>
                        <time>{new Date(message.at).toLocaleString()}</time>
                      </div>
                      <p>{message.text}</p>
                    </article>
                  ))}
              </div>
            ) : (
              <p className="empty-stat">No conversation history yet.</p>
            )}
          </section>
          {selected.status !== 'Opted out' && (
            <form
              className="client-viewing-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chosenProperty) return;
                void post(
                  {
                    action: 'meeting',
                    phone: selected.phone,
                    propertyId: chosenProperty,
                    date,
                    note,
                  },
                  `Viewing scheduled for ${chosenProperty}.`,
                );
              }}
            >
              <div>
                <p className="eyebrow">Client viewing</p>
                <h3>Schedule a property visit</h3>
              </div>
              <label>
                Verified property
                <select
                  required
                  value={chosenProperty}
                  onChange={(event) => setPropertyId(event.target.value)}
                >
                  {verifiedOptions.map((property) => (
                    <option value={property.id} key={property.id}>
                      {property.id} · {property.location}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date and time
                <input
                  required
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                Your note
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Access or attendee details"
                />
              </label>
              <button className="primary-action" disabled={!chosenProperty}>
                Schedule viewing
              </button>
            </form>
          )}
          <p className="grounding-note">
            <ShieldCheck /> Property choices come only from the uploaded
            catalogue. Confirm current availability before the visit.
          </p>
        </section>
      )}
    </>
  );
}

function LegacyLeadsDashboard({
  state,
  insights,
  leads,
  selected,
  query,
  setQuery,
  select,
  post,
  openModal,
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
  leads: LeadInsight[];
  selected?: LeadInsight;
  query: string;
  setQuery: (value: string) => void;
  select: (phone: string) => void;
  post: (body: object, success: string) => Promise<boolean>;
  openModal: () => void;
}) {
  const [filter, setFilter] = useState<
    'all' | 'ready' | 'follow-up' | 'no-match'
  >('all');
  const [ownerDraft, setOwnerDraft] = useState('');
  const [bookingProperty, setBookingProperty] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const buyer = (state.leads || []).find(
    (lead) => lead.phone === selected?.phone,
  );
  const filteredLeads = leads.filter((lead) =>
    filter === 'all'
      ? true
      : filter === 'ready'
        ? ['Follow up', 'Viewing proposed'].includes(lead.status)
        : filter === 'follow-up'
          ? lead.messageCount > 0 && lead.status !== 'Opted out'
          : lead.status === 'No match',
  );
  return (
    <>
      <div className="page-action-bar">
        <div>
          <SlidersHorizontal />
          <span>Use saved filters to focus the lead queue.</span>
        </div>
        <button className="primary-action add-leads-action" onClick={openModal}>
          <UserPlus /> Add leads
        </button>
      </div>
      <section className="leads-workbench">
        <aside className="lead-queue">
          <div className="queue-head">
            <div>
              <p className="eyebrow">Meeting pipeline</p>
              <strong>{filteredLeads.length} leads</strong>
            </div>
            <div className="lead-search">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search leads"
                aria-label="Search leads"
              />
            </div>
            <div className="saved-filters" aria-label="Saved lead filters">
              {(
                [
                  ['all', 'All'],
                  ['ready', 'Ready for viewing'],
                  ['follow-up', 'Needs follow-up'],
                  ['no-match', 'No match'],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={filter === value ? 'active' : ''}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  key={value}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="queue-list">
            {filteredLeads.length ? (
              filteredLeads.map((lead) => (
                <button
                  key={lead.phone}
                  className={
                    selected?.phone === lead.phone
                      ? 'lead-row active'
                      : 'lead-row'
                  }
                  onClick={() => select(lead.phone)}
                  aria-pressed={selected?.phone === lead.phone}
                >
                  <div className="lead-row-top">
                    <strong>{lead.name}</strong>
                    <span
                      className={`status-pill status-${lead.status.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      {lead.status}
                    </span>
                  </div>
                  <p>{lead.summary}</p>
                  <small>
                    {lead.lastBuyerMessage || 'No buyer message yet'}
                  </small>
                  <div className="readiness-line">
                    <i style={{ width: `${lead.readiness}%` }} />
                    <span>{lead.readiness}% profile</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-panel">
                <MessageCircle />
                <h3>No matching conversations</h3>
                <p>
                  Try a different search or wait for an allowed WhatsApp contact
                  to message.
                </p>
              </div>
            )}
          </div>
        </aside>
        <article className="visit-brief">
          {selected ? (
            <>
              <header className="brief-header">
                <div>
                  <p className="eyebrow">Visit brief</p>
                  <h2>{selected.name}</h2>
                  <a href={`tel:${selected.phone}`}>{selected.phone}</a>
                  <label className="owner-control">
                    <span>Lead owner</span>
                    <input
                      value={ownerDraft || buyer?.owner || ''}
                      onChange={(event) => setOwnerDraft(event.target.value)}
                      onBlur={() => {
                        const owner = ownerDraft.trim();
                        if (owner !== (buyer?.owner || ''))
                          void post(
                            {
                              action: 'assignLead',
                              phone: selected.phone,
                              owner,
                            },
                            owner
                              ? `Assigned to ${owner}.`
                              : 'Lead is now unassigned.',
                          );
                      }}
                      placeholder="Unassigned"
                      aria-label="Person responsible for this lead"
                    />
                  </label>
                </div>
                <div className="brief-actions">
                  <div className="readiness-score">
                    <strong>{selected.readiness}%</strong>
                    <span>profile complete</span>
                  </div>
                  <button
                    className="export-button"
                    disabled={!insights}
                    onClick={() =>
                      insights && downloadLeadData(state, insights)
                    }
                  >
                    <Download /> Download agent + chat CSV
                  </button>
                </div>
              </header>
              <section
                className={
                  selected.status === 'Opted out'
                    ? 'next-action danger'
                    : 'next-action'
                }
              >
                <Sparkles />
                <div>
                  <span>Recommended manager action</span>
                  <strong>{selected.nextAction}</strong>
                </div>
              </section>
              <div className="brief-grid">
                <section>
                  <p className="eyebrow">Buyer profile</p>
                  <h3>{selected.summary}</h3>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>Messages</dt>
                      <dd>{selected.messageCount}</dd>
                    </div>
                    <div>
                      <dt>Last update</dt>
                      <dd>{new Date(selected.updatedAt).toLocaleString()}</dd>
                    </div>
                  </dl>
                </section>
                <section>
                  <p className="eyebrow">Confirm before the visit</p>
                  {selected.missing.length ? (
                    <ul className="missing-list">
                      {selected.missing.map((item) => (
                        <li key={item}>
                          <CircleAlert />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="complete-profile">
                      <CheckCircle2 />
                      Core requirements collected
                    </p>
                  )}
                </section>
              </div>
              <section className="recommend-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">What to show</p>
                    <h3>Property shortlist</h3>
                  </div>
                  <span>
                    {selected.recommendations.length} grounded matches
                  </span>
                </div>
                {selected.recommendations.length ? (
                  <div className="recommend-grid">
                    {selected.recommendations.map(
                      ({ property, reasons, specificallyMentioned }) => (
                        <article key={property.id}>
                          <div className="property-id">
                            <span>{property.id}</span>
                            {specificallyMentioned &&
                              selected.status !== 'Opted out' && (
                                <b>Physical meeting ready</b>
                              )}
                          </div>
                          <h4>{property.society || property.location}</h4>
                          <p>{property.location}</p>
                          <div className="property-facts">
                            <strong>{property.bedrooms} BHK</strong>
                            <strong>
                              {property.sqft.toLocaleString()} sq ft
                            </strong>
                            <strong>{price(property.priceLakhs)}</strong>
                          </div>
                          <ul>
                            {reasons.length ? (
                              reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))
                            ) : (
                              <li>Matches the recorded requirements</li>
                            )}
                          </ul>
                          <p
                            className={
                              specificallyMentioned &&
                              selected.status !== 'Opted out'
                                ? 'meeting-ready-label'
                                : 'meeting-ready-label pending'
                            }
                          >
                            {specificallyMentioned &&
                            selected.status !== 'Opted out'
                              ? 'Buyer ready for a physical meeting at this property'
                              : 'Confirm buyer interest before arranging a physical meeting'}
                          </p>
                          <small>{property.availability}</small>
                        </article>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="empty-panel compact">
                    <Building2 />
                    <p>
                      No catalog match yet. Clarify the missing requirements
                      before suggesting a visit.
                    </p>
                  </div>
                )}
              </section>
              <section className="meeting-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Physical meeting outcome</p>
                    <h3>Properties ready for a buyer visit</h3>
                  </div>
                  <span>Human confirmation required</span>
                </div>
                {selected.status === 'Opted out' ? (
                  <div className="meeting-empty danger">
                    <CircleAlert /> Do not arrange a meeting. The buyer opted
                    out.
                  </div>
                ) : selected.recommendations.some(
                    (item) => item.specificallyMentioned,
                  ) ? (
                  <div className="meeting-ready-content">
                    <div className="buyer-detail-grid">
                      <div>
                        <span>Buyer</span>
                        <strong>{selected.name}</strong>
                      </div>
                      <div>
                        <span>Phone</span>
                        <strong>{selected.phone}</strong>
                      </div>
                      <div>
                        <span>Budget</span>
                        <strong>
                          {buyer?.requirements.budget
                            ? price(buyer.requirements.budget)
                            : 'Confirm'}
                        </strong>
                      </div>
                      <div>
                        <span>Bedrooms</span>
                        <strong>
                          {buyer?.requirements.bedrooms
                            ? `${buyer.requirements.bedrooms} BHK`
                            : 'Confirm'}
                        </strong>
                      </div>
                      <div>
                        <span>Preferred area</span>
                        <strong>
                          {buyer?.requirements.location || 'Confirm'}
                        </strong>
                      </div>
                      <div>
                        <span>Timeline</span>
                        <strong>
                          {buyer?.requirements.timeline || 'Confirm'}
                        </strong>
                      </div>
                    </div>
                    <div className="meeting-ready-list">
                      {selected.recommendations
                        .filter((item) => item.specificallyMentioned)
                        .map(({ property }) => (
                          <div key={property.id}>
                            <CheckCircle2 />
                            <span>
                              <strong>
                                Buyer ready for a physical meeting at this
                                property
                              </strong>
                              {property.id} ·{' '}
                              {property.society || property.location}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="meeting-empty">
                    <CircleAlert /> The agent should ask which shortlisted
                    properties the buyer wants to visit and collect a preferred
                    date and time.
                  </div>
                )}
                <p className="meeting-disclaimer">
                  A manager must confirm the property&apos;s current
                  availability, attendee and appointment time. The AI never
                  claims a visit is booked.
                </p>
                {selected.status !== 'Opted out' &&
                  selected.recommendations.length > 0 && (
                    <form
                      className="schedule-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const propertyId =
                          bookingProperty ||
                          selected.recommendations[0].property.id;
                        void post(
                          {
                            action: 'meeting',
                            phone: selected.phone,
                            propertyId,
                            date: bookingDate,
                            note: bookingNote,
                          },
                          `Viewing proposed for ${propertyId}.`,
                        );
                      }}
                    >
                      <h4>Schedule a physical viewing</h4>
                      <label>
                        Verified property
                        <select
                          value={
                            bookingProperty ||
                            selected.recommendations[0].property.id
                          }
                          onChange={(event) =>
                            setBookingProperty(event.target.value)
                          }
                        >
                          {selected.recommendations.map(({ property }) => (
                            <option value={property.id} key={property.id}>
                              {property.id} · {property.location}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Date and time
                        <input
                          required
                          type="datetime-local"
                          value={bookingDate}
                          onChange={(event) =>
                            setBookingDate(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Your note
                        <input
                          value={bookingNote}
                          onChange={(event) =>
                            setBookingNote(event.target.value)
                          }
                          placeholder="Access, attendee or confirmation note"
                        />
                      </label>
                      <button className="primary-action">
                        Propose viewing
                      </button>
                    </form>
                  )}
              </section>
            </>
          ) : (
            <div className="empty-panel">
              <Users />
              <h3>Select a lead</h3>
              <p>Choose a conversation to prepare a call or property visit.</p>
            </div>
          )}
        </article>
      </section>
    </>
  );
}

function formatViewingStatus(status?: string) {
  return (status || 'proposed')
    .replaceAll('-', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function safeMeetingDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-panel compact">
      <CircleAlert />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function PropertiesDashboard({
  state,
  insights,
  openModal,
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
  openModal: () => void;
}) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get('id') || '';
  const [query, setQuery] = useState('');
  useEffect(() => {
    setQuery(requestedId);
  }, [requestedId]);
  const trendById = new Map(
    (insights?.trends.properties || []).map((item) => [item.property.id, item]),
  );
  const properties = state.properties
    .map((property) => {
      const trend = trendById.get(property.id);
      const inquiries = trend?.inquiries || 0;
      const interestedLeads = trend?.interestedLeads || 0;
      const requirementMatches = trend?.requirementMatches || 0;
      return {
        property,
        inquiries,
        interestedLeads,
        requirementMatches,
        demandScore:
          inquiries * 100 + interestedLeads * 10 + requirementMatches,
      };
    })
    .filter(({ property }) =>
      `${property.id} ${property.location} ${property.society || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.demandScore - a.demandScore);

  return (
    <>
      <div className="page-action-bar property-action-bar">
        <div>
          <ShieldCheck />
          <span>
            Demand signals use WhatsApp conversations and verified listings.
          </span>
        </div>
        <button
          className="primary-action add-properties-action"
          onClick={openModal}
        >
          <Plus /> Add properties
        </button>
      </div>

      <section
        className="property-insights-first"
        aria-label="Buyer demand insights"
      >
        <TrendsDashboard insights={insights} />
      </section>

      <section className="insight-property-catalog">
        <div className="property-catalog-heading">
          <div>
            <p className="eyebrow">Insight-ranked catalog</p>
            <h2>Property information</h2>
            <p>
              Listings with stronger buyer signals appear first. Every fact
              still comes from the uploaded property dataset.
            </p>
          </div>
          <label className="property-insight-search">
            <Search />
            <input
              aria-label="Search property information"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search property, society or sector"
            />
          </label>
        </div>

        {properties.length ? (
          <div className="property-intelligence-grid">
            {properties
              .slice(0, 60)
              .map(
                ({
                  property,
                  inquiries,
                  interestedLeads,
                  requirementMatches,
                  demandScore,
                }) => (
                  <article
                    className="property-intelligence-card"
                    key={property.id}
                  >
                    <div className="property-intelligence-topline">
                      <span className="verified-label">
                        <ShieldCheck /> Verified listing
                      </span>
                      <b
                        className={
                          demandScore ? 'demand-signal active' : 'demand-signal'
                        }
                      >
                        {inquiries
                          ? 'Directly requested'
                          : interestedLeads
                            ? 'Buyer interest'
                            : requirementMatches
                              ? 'Requirement match'
                              : 'No demand yet'}
                      </b>
                    </div>
                    <div>
                      <span className="property-code">{property.id}</span>
                      <h3>{property.society || property.location}</h3>
                      <p>{property.location}</p>
                    </div>
                    <div className="property-detail-strip">
                      <span>
                        <b>{property.bedrooms}</b> BHK
                      </span>
                      <span>
                        <b>{property.sqft.toLocaleString('en-IN')}</b> sq ft
                      </span>
                      <span>
                        <b>{price(property.priceLakhs)}</b> listed
                      </span>
                    </div>
                    <div className="property-demand-signals">
                      <span>
                        <b>{inquiries}</b> direct inquiries
                      </span>
                      <span>
                        <b>{interestedLeads}</b> interested leads
                      </span>
                      <span>
                        <b>{requirementMatches}</b> requirement matches
                      </span>
                    </div>
                    <p className="availability-note">{property.availability}</p>
                  </article>
                ),
              )}
          </div>
        ) : (
          <EmptyState
            title="No verified property found"
            text="Try another property ID, society or sector, or add a listing."
          />
        )}
      </section>
    </>
  );
}

function PropertyComparison({
  state,
  insights,
  post,
  openModal,
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
  post: (body: object, success: string) => Promise<boolean>;
  openModal: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    state.properties.slice(0, 2).map((property) => property.id),
  );
  const [buyerPhone, setBuyerPhone] = useState(insights?.leads[0]?.phone || '');
  const [date, setDate] = useState('');
  const filtered = state.properties.filter((property) =>
    `${property.id} ${property.location} ${property.society || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const compared = selectedIds
    .map((id) => state.properties.find((property) => property.id === id))
    .filter((property): property is Property => Boolean(property));
  const shortlist = compared
    .map(
      (property) =>
        `${property.id}: ${property.bedrooms} BHK, ${property.location}, ${property.sqft.toLocaleString('en-IN')} sq ft, ${price(property.priceLakhs)}. ${property.availability}`,
    )
    .join('\n');
  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    );
  }
  return (
    <>
      <div className="page-action-bar">
        <div>
          <ShieldCheck />
          <span>
            Only uploaded catalogue records can be compared and analyzed.
          </span>
        </div>
        <button
          className="primary-action add-properties-action"
          onClick={openModal}
        >
          <Plus /> Add properties
        </button>
      </div>
      <section className="comparison-workbench">
        <div className="catalog-panel">
          <div className="catalog-toolbar">
            <label>
              <Search />
              <input
                aria-label="Search verified property catalogue"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search verified catalog"
              />
            </label>
            <span>{selectedIds.length}/4 selected</span>
          </div>
          <div className="catalog-list">
            {filtered.length ? (
              filtered.slice(0, 60).map((property) => (
                <button
                  className={
                    selectedIds.includes(property.id)
                      ? 'catalog-item selected'
                      : 'catalog-item'
                  }
                  onClick={() => toggle(property.id)}
                  key={property.id}
                  aria-pressed={selectedIds.includes(property.id)}
                >
                  <span className="verified-label">
                    <ShieldCheck /> Verified catalogue record
                  </span>
                  <strong>{property.id}</strong>
                  <span>{property.society || property.location}</span>
                  <small>
                    {property.location} · {property.bedrooms} BHK ·{' '}
                    {price(property.priceLakhs)}
                  </small>
                </button>
              ))
            ) : (
              <EmptyState
                title="No verified properties found"
                text="Try another property ID, society or sector—or upload listings from Overview."
              />
            )}
          </div>
        </div>
        <div className="comparison-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Verified side-by-side review</p>
              <h2>Property comparison</h2>
            </div>
            <button
              className="export-button"
              disabled={!compared.length}
              onClick={() => void navigator.clipboard.writeText(shortlist)}
            >
              <GitCompare /> Copy WhatsApp shortlist
            </button>
          </div>
          {compared.length ? (
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    {compared.map((property) => (
                      <th key={property.id}>{property.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Catalog status</th>
                    {compared.map((property) => (
                      <td key={property.id}>
                        <span className="verified-label">
                          <ShieldCheck /> Verified
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Location</th>
                    {compared.map((property) => (
                      <td key={property.id}>{property.location}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Bedrooms</th>
                    {compared.map((property) => (
                      <td key={property.id}>{property.bedrooms} BHK</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Area</th>
                    {compared.map((property) => (
                      <td key={property.id}>
                        {property.sqft.toLocaleString('en-IN')} sq ft
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Recorded price</th>
                    {compared.map((property) => (
                      <td key={property.id}>{price(property.priceLakhs)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Availability note</th>
                    {compared.map((property) => (
                      <td key={property.id}>{property.availability}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Select 2–4 properties"
              text="Choose only records from the verified catalog to build a buyer-ready comparison."
            />
          )}
          <form
            className="inline-scheduler property-scheduler-removed"
            onSubmit={(event) => {
              event.preventDefault();
              const propertyId = compared[0]?.id;
              if (buyerPhone && propertyId)
                void post(
                  { action: 'meeting', phone: buyerPhone, propertyId, date },
                  `Viewing proposed for ${propertyId}.`,
                );
            }}
          >
            <div>
              <p className="eyebrow">Next action</p>
              <h3>Schedule a viewing</h3>
            </div>
            <label>
              Buyer
              <select
                required
                value={buyerPhone}
                onChange={(event) => setBuyerPhone(event.target.value)}
              >
                <option value="">Select buyer</option>
                {(insights?.leads || [])
                  .filter((lead) => lead.status !== 'Opted out')
                  .map((lead) => (
                    <option value={lead.phone} key={lead.phone}>
                      {lead.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Property
              <select
                required
                value={selectedIds[0] || ''}
                onChange={(event) =>
                  setSelectedIds((current) => [
                    event.target.value,
                    ...current.filter((id) => id !== event.target.value),
                  ])
                }
              >
                <option value="">Select property</option>
                {compared.map((property) => (
                  <option value={property.id} key={property.id}>
                    {property.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date and time
              <input
                required
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button
              className="primary-action"
              disabled={!buyerPhone || !compared.length}
            >
              Create viewing request
            </button>
          </form>
          <p className="grounding-note">
            <ShieldCheck /> Every displayed fact comes from the uploaded
            property catalogue. Current price and availability still require
            human confirmation.
          </p>
        </div>
      </section>
      <section className="integrated-insights" aria-label="Property insights">
        <div className="section-heading integrated-insights-heading">
          <div>
            <p className="eyebrow">Live buyer demand</p>
            <h2>Property insights</h2>
          </div>
          <span>Calculated from WhatsApp conversations</span>
        </div>
        <TrendsDashboard insights={insights} />
      </section>
    </>
  );
}

function ViewingDesk({
  state,
  post,
}: {
  state: Workspace;
  post: (body: object, success: string) => Promise<boolean>;
}) {
  const [phone, setPhone] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const eligible = (state.leads || []).filter(
    (lead) => lead.status !== 'Opted out',
  );
  const viewings = (state.leads || []).filter((lead) => lead.meeting);
  return (
    <>
      <section className="meeting-grounding-banner">
        <ShieldCheck />
        <div>
          <strong>Grounded meeting schedule</strong>
          <p>
            The agent sees only meetings listed here and verified properties
            from this workspace. Proposed visits are never presented as
            confirmed bookings.
          </p>
        </div>
        <span>{viewings.length} scheduled</span>
      </section>
      <section className="viewing-layout">
      <article className="viewing-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live schedule</p>
            <h2>All meetings</h2>
          </div>
          <span>{viewings.length} total</span>
        </div>
        {viewings.length ? (
          <div className="viewing-list">
            {viewings.map((lead) => {
              const property = state.properties.find(
                (item) => item.id === lead.meeting?.propertyId,
              );
              return (
                <article key={lead.phone}>
                  <div>
                    <span
                      className={`viewing-label ${lead.meeting?.status || 'proposed'}`}
                    >
                      {formatViewingStatus(lead.meeting?.status)}
                    </span>
                    <h3>{lead.name}</h3>
                    <p>{lead.phone}</p>
                  </div>
                  <div>
                    <strong>{property?.id || 'Missing catalog record'}</strong>
                    <p>
                      {property?.location || 'Property details unavailable'}
                    </p>
                    <small>{safeMeetingDate(lead.meeting?.date || '')}</small>
                  </div>
                  <div className="viewing-actions">
                    {(
                      ['confirmed', 'reschedule-needed', 'completed'] as const
                    ).map((status) => (
                      <button
                        key={status}
                        onClick={() =>
                          void post(
                            {
                              action: 'viewingStatus',
                              phone: lead.phone,
                              status,
                            },
                            `Viewing marked ${formatViewingStatus(status).toLowerCase()}.`,
                          )
                        }
                      >
                        {formatViewingStatus(status)}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No property visits yet"
            text="Use the scheduler to propose the first physical viewing for an eligible CRM lead."
          />
        )}
      </article>
      <form
        className="scheduler-card"
        onSubmit={(event) => {
          event.preventDefault();
          void post(
            { action: 'meeting', phone, propertyId, date, note },
            `Viewing proposed for ${propertyId}.`,
          );
        }}
      >
        <p className="eyebrow">Viewing scheduler</p>
        <h2>Propose a visit</h2>
        <label>
          Buyer
          <select
            required
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              const lead = eligible.find(
                (item) => item.phone === event.target.value,
              );
              setPropertyId(lead?.interestedId || '');
            }}
          >
            <option value="">Select buyer</option>
            {eligible.map((lead) => (
              <option value={lead.phone} key={lead.phone}>
                {lead.name} · {lead.owner || 'Unassigned'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Verified property
          <select
            required
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
          >
            <option value="">Select catalog property</option>
            {state.properties.map((property) => (
              <option value={property.id} key={property.id}>
                {property.id} · {property.location}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date and time
          <input
            required
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Visit note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Attendee, access or confirmation details"
          />
        </label>
        <button className="primary-action">Propose viewing</button>
        <p className="grounding-note">
          <CircleAlert /> A proposal is not a confirmed booking. You must verify
          the property, attendee and time.
        </p>
      </form>
      </section>
    </>
  );
}

function DemandBars({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <article className="trend-card">
      <p className="eyebrow">Buyer requirements</p>
      <h3>{title}</h3>
      <div className="demand-bars">
        {rows.length ? (
          rows.slice(0, 8).map((row) => (
            <div key={row.label}>
              <div>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
              <i>
                <b style={{ width: `${(row.count / max) * 100}%` }} />
              </i>
            </div>
          ))
        ) : (
          <p className="empty-stat">No requirement data yet.</p>
        )}
      </div>
    </article>
  );
}

function TrendsDashboard({ insights }: { insights: WorkspaceInsights | null }) {
  const trends = insights?.trends;
  return (
    <>
      <section className="property-demand">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog demand</p>
            <h2>Properties buyers are asking about</h2>
          </div>
          <span>Direct inquiry ≠ inferred match</span>
        </div>
        {trends?.properties.length ? (
          <div
            className="demand-table-wrap"
            role="region"
            aria-label="Buyer interest by property, scroll horizontally for all fields"
            tabIndex={0}
          >
            <table className="demand-table" aria-label="Buyer interest by property">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Location</th>
                  <th>Price</th>
                  <th>Direct inquiries</th>
                  <th>Interested leads</th>
                  <th>Requirement matches</th>
                </tr>
              </thead>
              <tbody>
                {trends.properties.slice(0, 20).map((item) => (
                  <tr key={item.property.id}>
                    <td>
                      <strong>
                        {item.property.society || item.property.id}
                      </strong>
                      <small>
                        {item.property.bedrooms} BHK ·{' '}
                        {item.property.sqft.toLocaleString()} sq ft
                      </small>
                    </td>
                    <td>{item.property.location}</td>
                    <td>{price(item.property.priceLakhs)}</td>
                    <td>
                      <b className="demand-count hot">{item.inquiries}</b>
                    </td>
                    <td>
                      <b className="demand-count">{item.interestedLeads}</b>
                    </td>
                    <td>
                      <b className="demand-count soft">
                        {item.requirementMatches}
                      </b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            <BarChart3 />
            <h3>No property demand yet</h3>
            <p>
              Demand appears after buyers name a property or share enough
              requirements for a catalog match.
            </p>
          </div>
        )}
      </section>
      <section className="trend-grid">
        <DemandBars
          title="Most requested sectors"
          rows={trends?.sectors || []}
        />
        <DemandBars title="Bedroom demand" rows={trends?.bedrooms || []} />
        <DemandBars title="Budget distribution" rows={trends?.budgets || []} />
      </section>
      <p className="trend-method">
        <ShieldCheck />
        Direct inquiries require a buyer message to name a listing ID or
        society. Requirement matches use only recorded budget, bedroom and
        location preferences.
      </p>
    </>
  );
}
