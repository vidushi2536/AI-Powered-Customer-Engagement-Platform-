'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
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

type Section = 'onboarding' | 'dashboard' | 'leads' | 'trends';
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
  signOut,
}: {
  section: Section;
  signOut: () => void;
}) {
  return (
    <header className="manager-header">
      <Link className="landing-brand" href="/dashboard">
        <span>
          <Building2 size={19} />
        </span>{' '}
        Estate Desk
      </Link>
      <nav className="manager-nav" aria-label="Manager dashboards">
        <Link
          className={section === 'dashboard' ? 'active' : ''}
          href="/dashboard"
        >
          <Home />
          Overview
        </Link>
        <Link className={section === 'leads' ? 'active' : ''} href="/leads">
          <Users />
          Meetings
        </Link>
        <Link className={section === 'trends' ? 'active' : ''} href="/trends">
          <BarChart3 />
          Trends
        </Link>
      </nav>
      <button className="header-signout" onClick={signOut}>
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </header>
  );
}

export default function WorkspaceApp({ section }: { section: Section }) {
  const [state, setState] = useState<Workspace | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
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
  const [notice, setNotice] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [modal, setModal] = useState<'clients' | 'properties' | null>(null);
  const [query, setQuery] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');
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

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace', { cache: 'no-store' });
      const result = (await response.json()) as WorkspaceResult;
      if (response.status === 401) return window.location.replace('/');
      if (!response.ok)
        throw new Error(result.error || 'Could not load workspace.');
      setState(result.state || null);
      setStats(result.stats || null);
      setInsights(result.insights || null);
      if (section !== 'onboarding' && !result.state?.onboardingComplete)
        window.location.replace('/onboarding');
    } catch (reason) {
      setError(
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
        setStats(result.stats || null);
        setInsights(result.insights || null);
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

  const statuses = useMemo(
    () =>
      stats
        ? Object.entries(stats.statusCounts).sort((a, b) => b[1] - a[1])
        : [],
    [stats],
  );
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
    visibleLeads[0];

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
      setStats(result.stats || null);
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
          contacts,
          properties,
          consentConfirmed: confirmed,
        }),
      });
      const result = (await response.json()) as WorkspaceResult;
      if (!response.ok)
        throw new Error(result.error || 'Could not finish setup.');
      window.location.assign('/dashboard');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not finish setup.',
      );
    } finally {
      setBusy(false);
    }
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

  function addProperty(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void post(
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
  }

  async function signOut() {
    await fetch('/api/auth', { method: 'DELETE' });
    window.location.assign('/');
  }

  if (!state)
    return <main className="setup-loading">Preparing your workspace…</main>;

  if (section === 'onboarding')
    return (
      <main className="setup-shell">
        <header className="setup-header">
          <Link className="landing-brand" href="/">
            <span>
              <Building2 size={19} />
            </span>
            Estate Desk
          </Link>
          <p>Workspace setup</p>
        </header>
        <section className="setup-intro">
          <p className="eyebrow">Two files. One focused dashboard.</p>
          <h1>Connect your property operation.</h1>
          <p>
            Import the listings the agent may discuss and the CRM contacts it
            may recognize on WhatsApp.
          </p>
        </section>
        <section className="setup-cards">
          <article className="upload-card">
            <div className="step-number">01</div>
            <Database size={23} />
            <h2>Property listings</h2>
            <p>
              Use the included 120-listing Gurgaon sample, or replace it with
              your CSV.
            </p>
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
            <div className="step-number">02</div>
            <Users size={23} />
            <h2>CRM contacts</h2>
            <p>A phone-only CSV works. Optional columns: name and consent.</p>
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
        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        <div className="setup-actions">
          <button
            className="finish-button"
            disabled={busy || !contacts.length || !confirmed}
            onClick={() => void finishOnboarding()}
          >
            {busy ? 'Saving workspace…' : 'Open dashboard'}
            <ArrowRight size={18} />
          </button>
        </div>
      </main>
    );

  const pageTitles = {
    dashboard: [
      'WhatsApp intelligence',
      'Your pipeline, at a glance.',
      'Live customer signals, inventory coverage and manager actions.',
    ],
    leads: [
      'Physical meeting pipeline',
      'Turn interest into property visits.',
      'Know which properties each buyer is ready to see and what still needs confirmation.',
    ],
    trends: [
      'Demand intelligence',
      'See what buyers ask for.',
      'Property inquiries and requirement patterns matched to your catalog.',
    ],
  } as const;
  const [eyebrow, title, subtitle] = pageTitles[section];

  return (
    <main className="stats-shell manager-shell">
      <ManagerHeader section={section} signOut={() => void signOut()} />
      <section className="manager-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div
          className={liveConnected ? 'live-status connected' : 'live-status'}
        >
          <i /> {liveConnected ? 'Live updates connected' : 'Reconnecting…'}
          <button aria-label="Refresh now" onClick={() => void load()}>
            <RefreshCw size={15} />
          </button>
        </div>
      </section>
      {error && (
        <p className="setup-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-notice">
          <CheckCircle2 size={17} />
          {notice}
        </p>
      )}

      {section === 'dashboard' && (
        <Overview stats={stats} statuses={statuses} openModal={setModal} />
      )}
      {section === 'leads' && (
        <LeadsDashboard
          state={state}
          insights={insights}
          leads={visibleLeads}
          selected={selectedLead}
          query={query}
          setQuery={setQuery}
          select={setSelectedPhone}
        />
      )}
      {section === 'trends' && <TrendsDashboard insights={insights} />}

      <footer className="stats-footer">
        Insights are derived from WhatsApp messages and uploaded listing data.
        Verify availability before committing to a viewing.
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
  stats,
  statuses,
  openModal,
}: {
  stats: Stats | null;
  statuses: Array<[string, number]>;
  openModal: (modal: 'clients' | 'properties') => void;
}) {
  return (
    <>
      <section className="manager-actions">
        <button onClick={() => openModal('clients')}>
          <span>
            <UserPlus />
          </span>
          <div>
            <strong>Add new clients</strong>
            <small>Form or CRM CSV</small>
          </div>
          <ChevronRight />
        </button>
        <button onClick={() => openModal('properties')}>
          <span>
            <Building2 />
          </span>
          <div>
            <strong>Add new properties</strong>
            <small>Form or listings CSV</small>
          </div>
          <ChevronRight />
        </button>
      </section>
      <section className="metric-grid">
        <article>
          <Users />
          <p>CRM contacts</p>
          <strong>{stats?.contacts || 0}</strong>
          <span>Recognized numbers</span>
        </article>
        <article>
          <MessageCircle />
          <p>WhatsApp messages</p>
          <strong>{stats?.totalMessages || 0}</strong>
          <span>{stats?.activeLeads || 0} active conversations</span>
        </article>
        <article>
          <ShieldCheck />
          <p>Qualified leads</p>
          <strong>{stats?.qualified || 0}</strong>
          <span>Budget and bedrooms known</span>
        </article>
        <article className="accent-metric">
          <BarChart3 />
          <p>Physical meeting leads</p>
          <strong>{stats?.followUps || 0}</strong>
          <span>Interest or viewing signal</span>
        </article>
      </section>
      <section className="analytics-grid">
        <article className="analytics-card">
          <div className="analytics-heading">
            <div>
              <p className="eyebrow">Lead state</p>
              <h2>Pipeline distribution</h2>
            </div>
            <Link href="/leads">
              Open leads <ArrowRight size={14} />
            </Link>
          </div>
          <div className="status-bars">
            {statuses.length ? (
              statuses.map(([status, count]) => (
                <div className="status-row" key={status}>
                  <span>{status}</span>
                  <div>
                    <i
                      style={{
                        width: `${Math.max(8, (count / Math.max(1, stats?.contacts || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <p className="empty-stat">
                Statistics will appear after the first WhatsApp conversation.
              </p>
            )}
          </div>
        </article>
        <article className="analytics-card signal-card">
          <p className="eyebrow">Coverage</p>
          <div
            className="coverage-ring"
            style={
              {
                '--coverage': `${stats?.responseCoverage || 0}%`,
              } as CSSProperties
            }
          >
            <strong>{stats?.responseCoverage || 0}%</strong>
            <span>contacts engaged</span>
          </div>
          <div className="signal-list">
            <p>
              <span>Property catalog</span>
              <strong>{stats?.catalog || 0}</strong>
            </p>
            <p>
              <span>Opted out</span>
              <strong>{stats?.optedOut || 0}</strong>
            </p>
            <p>
              <span>Last activity</span>
              <strong>
                {stats?.lastActivity
                  ? new Date(stats.lastActivity).toLocaleDateString()
                  : '—'}
              </strong>
            </p>
          </div>
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
}: {
  state: Workspace;
  insights: WorkspaceInsights | null;
  leads: LeadInsight[];
  selected?: LeadInsight;
  query: string;
  setQuery: (value: string) => void;
  select: (phone: string) => void;
}) {
  const buyer = (state.leads || []).find(
    (lead) => lead.phone === selected?.phone,
  );
  return (
    <section className="leads-workbench">
      <aside className="lead-queue">
        <div className="queue-head">
          <div>
            <p className="eyebrow">Meeting pipeline</p>
            <strong>{leads.length} leads</strong>
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
        </div>
        <div className="queue-list">
          {leads.length ? (
            leads.map((lead) => (
              <button
                key={lead.phone}
                className={
                  selected?.phone === lead.phone
                    ? 'lead-row active'
                    : 'lead-row'
                }
                onClick={() => select(lead.phone)}
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
                <small>{lead.lastBuyerMessage || 'No buyer message yet'}</small>
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
              </div>
              <div className="brief-actions">
                <div className="readiness-score">
                  <strong>{selected.readiness}%</strong>
                  <span>profile complete</span>
                </div>
                <button
                  className="export-button"
                  disabled={!insights}
                  onClick={() => insights && downloadLeadData(state, insights)}
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
                <span>{selected.recommendations.length} grounded matches</span>
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
                  <CircleAlert /> Do not arrange a meeting. The buyer opted out.
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
                A manager must confirm the property&apos;s current availability,
                attendee and appointment time. The AI never claims a visit is
                booked.
              </p>
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
  const interested =
    trends?.properties.reduce((sum, item) => sum + item.interestedLeads, 0) ||
    0;
  const coverage =
    trends?.properties.reduce(
      (sum, item) => sum + item.requirementMatches,
      0,
    ) || 0;
  return (
    <>
      <section className="trend-metrics">
        <article>
          <MessageCircle />
          <span>Direct property inquiries</span>
          <strong>{trends?.directPropertyInquiries || 0}</strong>
          <small>Messages naming a listing</small>
        </article>
        <article>
          <Sparkles />
          <span>Explicit property interest</span>
          <strong>{interested}</strong>
          <small>Leads linked to a property</small>
        </article>
        <article>
          <Building2 />
          <span>Requirement matches</span>
          <strong>{coverage}</strong>
          <small>Catalog-to-buyer matches</small>
        </article>
      </section>
      <section className="property-demand">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog demand</p>
            <h2>Properties buyers are asking about</h2>
          </div>
          <span>Direct inquiry ≠ inferred match</span>
        </div>
        {trends?.properties.length ? (
          <div className="demand-table-wrap">
            <table className="demand-table">
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
