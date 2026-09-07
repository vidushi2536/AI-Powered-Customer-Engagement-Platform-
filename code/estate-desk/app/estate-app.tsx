'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  Database,
  Download,
  LockKeyhole,
  MapPin,
  Maximize,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  brief,
  matches,
  type Property,
  type Workspace,
} from '@/lib/domain';

type ApiResult = {
  state: Workspace;
  error?: string;
  message?: string;
  mode?: string;
  allowedPhone: string;
  brief: ReturnType<typeof brief>;
};

const nav = ['Overview', 'Leads', 'Properties', 'Connections', 'Agent'];
const headings: Record<string, [string, string]> = {
  overview: [
    'Your next move.',
    'WhatsApp conversations, property matches and advisor actions in one place.',
  ],
  leads: [
    'The conversation, translated.',
    'Read what happened on WhatsApp. Know when a human should step in.',
  ],
  properties: [
    'Gurgaon homes, ready to test.',
    'A historical Kaggle catalog for matching and agent evaluation.',
  ],
  connections: [
    'One sender. One test lead.',
    'Your WhatsApp account, simulated CRM and dashboard sync.',
  ],
  agent: [
    'A specialist. By design.',
    'Property discovery and viewing interest only—nothing else.',
  ],
  login: [
    'Associate your WhatsApp number.',
    'Link the sender identity to this private dashboard workspace.',
  ],
};

function PropertyCard({
  property,
  onOpen,
}: {
  property: Property;
  onOpen: (property: Property) => void;
}) {
  return (
    <button className="property-card" onClick={() => onOpen(property)}>
      <div className="property-top">
        <img src={property.image} alt="Illustrative apartment interior" />
        <span className="photo-label">Illustrative photo</span>
      </div>
      <div className="property-body">
        <div className="row spread">
          <h3>{property.id}</h3>
          <ArrowUpRight size={18} />
        </div>
        <p className="row">
          <MapPin size={14} /> {property.location}
        </p>
        <p className="row">
          <BedDouble size={14} /> {property.bedrooms} BHK <span>·</span>
          <Maximize size={14} /> {property.sqft.toLocaleString('en-IN')} sq ft
        </p>
        <div className="row spread">
          <span className="price">
            ₹{property.priceLakhs.toLocaleString('en-IN')}{' '}
            <small>lakh</small>
          </span>
          <span className="badge">
            {property.source === 'Your CSV' ? 'Uploaded' : 'Kaggle sample'}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function EstateApp({
  section = 'overview',
}: {
  section?: string;
}) {
  const [state, setState] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);
  const [search, setSearch] = useState('');
  const [beds, setBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState('');
  const [allowedPhone, setAllowedPhone] = useState('+919999999999');
  const [phone, setPhone] = useState('+919999999999');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneInfo, setPhoneInfo] = useState('');
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [date, setDate] = useState('');
  const [meetingNote, setMeetingNote] = useState('');
  const [upload, setUpload] = useState<Record<string, unknown>[] | null>(null);
  const [uploadName, setUploadName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  async function load(silent = false) {
    try {
      const response = await fetch('/api/workspace', { cache: 'no-store' });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || 'Workspace unavailable');
      setState(result.state);
      if (result.allowedPhone) {
        setAllowedPhone(result.allowedPhone);
        setPhone((current) =>
          current === '+919999999999' ? result.allowedPhone : current,
        );
      }
      setError('');
      if (!silent) setFeedback('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Workspace unavailable');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!['overview', 'leads'].includes(section)) return;
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [section]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [state?.messages.length]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || 'Could not save change');
      setState(result.state);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save change');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function phoneAction(actionName: 'send' | 'verify') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, phone, code }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) throw new Error(result.error || 'Phone setup failed');
      if (actionName === 'send') {
        setCodeSent(true);
        setPhoneInfo(result.message || '');
      } else {
        setCodeSent(false);
        setCode('');
        setFeedback('WhatsApp sender associated with this dashboard.');
        await load(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Phone setup failed');
    } finally {
      setBusy(false);
    }
  }

  function exportConversation() {
    if (!state) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            contact: allowedPhone,
            source: 'WhatsApp',
            status: state.status,
            summary: brief(state),
            messages: state.messages,
            meeting: state.meeting,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'estate-desk-whatsapp-conversation.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function parseUpload(file: File) {
    setError('');
    try {
      if (file.size > 200000) throw new Error('Choose a CSV under 200 KB.');
      const lines = (await file.text()).trim().split(/\r?\n/);
      const parse = (line: string) => {
        const row: string[] = [];
        let value = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') {
            if (quoted && line[i + 1] === '"') {
              value += '"';
              i++;
            } else quoted = !quoted;
          } else if (line[i] === ',' && !quoted) {
            row.push(value.trim());
            value = '';
          } else value += line[i];
        }
        if (quoted) throw new Error('Unclosed quote in CSV');
        row.push(value.trim());
        return row;
      };
      const keys = parse(lines[0]).map((key) =>
        key.toLowerCase().replace(/^\uFEFF/, ''),
      );
      for (const key of ['location', 'bedrooms', 'sqft', 'price_lakhs'])
        if (!keys.includes(key))
          throw new Error(
            'Required columns: location, bedrooms, sqft, price_lakhs',
          );
      const records = lines
        .slice(1)
        .filter(Boolean)
        .map((line, index) => {
          const values = parse(line);
          const record = Object.fromEntries(
            keys.map((key, column) => [key, values[column]]),
          );
          const property = {
            location: record.location,
            bedrooms: Number(record.bedrooms),
            sqft: Number(record.sqft),
            priceLakhs: Number(record.price_lakhs),
          };
          if (
            !property.location ||
            !property.bedrooms ||
            !property.sqft ||
            !property.priceLakhs
          )
            throw new Error(`Check values on row ${index + 2}`);
          return property;
        });
      if (!records.length || records.length > 100)
        throw new Error('Import 1–100 rows at a time.');
      setUpload(records);
      setUploadName(file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid CSV');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const summary = state ? brief(state) : null;
  const matching = state ? matches(state.properties, state.requirements) : [];
  const shown =
    state?.properties.filter(
      (property) =>
        (!search ||
          `${property.location} ${property.society || ''} ${property.id}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!beds || property.bedrooms === beds) &&
        (!maxPrice || property.priceLakhs <= Number(maxPrice)),
    ) || [];
  const interested = state?.properties.find(
    (property) => property.id === state.interestedId,
  );
  const title = headings[section] || headings.overview;
  const whatsappLive = !!state?.whatsapp?.connected;

  return (
    <>
      <header className="topbar">
        <Link className="wordmark" href="/">
          <Building2 /> estate desk
        </Link>
        <nav className="topnav" aria-label="Main navigation">
          {nav.map((item, index) => (
            <Link
              key={item}
              className={section === item.toLowerCase() ? 'active' : ''}
              href={index === 0 ? '/' : '/' + item.toLowerCase()}
            >
              {item}
            </Link>
          ))}
        </nav>
        <div className="row">
          <span className="status">
            <span className={`dot ${whatsappLive ? 'green' : ''}`} />
            {whatsappLive ? 'WhatsApp syncing' : 'Awaiting WhatsApp'}
          </span>
          <Link className="avatar" href="/login" aria-label="Phone setup">
            AK
          </Link>
        </div>
      </header>

      <main className="shell">
        <div className="eyebrow">Estate Desk / {section}</div>
        <div className="pagehead">
          <div>
            <h1>{title[0]}</h1>
            <p>{title[1]}</p>
          </div>
          {section === 'overview' ? (
            <Link className="btn primary" href="/leads">
              Open lead <ArrowUpRight />
            </Link>
          ) : section === 'leads' ? (
            <div className="row">
              <button className="btn" onClick={() => void load()}>
                <RefreshCw /> Refresh
              </button>
              <button
                className="btn"
                disabled={!state?.messages.length}
                onClick={exportConversation}
              >
                <Download /> Export
              </button>
            </div>
          ) : section === 'properties' ? (
            <button className="btn primary" onClick={() => fileInput.current?.click()}>
              <Plus /> Add properties
            </button>
          ) : section === 'agent' ? (
            <span className="status">
              <ShieldCheck size={15} /> Real-estate only
            </span>
          ) : null}
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error === 'UNAUTHORIZED' ? (
              <>
                Sign in to access this workspace.{' '}
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  Sign in with ChatGPT →
                </a>
              </>
            ) : (
              error
            )}
          </div>
        )}
        {feedback && (
          <div className="notice row spread" role="status">
            <span>{feedback}</span>
            <button aria-label="Dismiss" onClick={() => setFeedback('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {!state && !error && <div className="loading">Loading workspace…</div>}

        {state && section === 'overview' && (
          <>
            <div className="metrics">
              {[
                ['CRM leads', state.crm ? '01' : '00', 'One allowlisted test contact'],
                [
                  'Follow up',
                  ['Follow up', 'Viewing proposed'].includes(state.status)
                    ? '01'
                    : '00',
                  state.status,
                ],
                [
                  'Properties',
                  String(state.properties.length).padStart(2, '0'),
                  'Gurgaon Kaggle sample',
                ],
                [
                  'WA messages',
                  String(state.messages.length).padStart(2, '0'),
                  whatsappLive ? 'Live sync received' : 'Waiting for first event',
                ],
              ].map(([label, value, caption]) => (
                <div className="stat" key={label}>
                  <label>{label}</label>
                  <div className="metric">{value}</div>
                  <small>{caption}</small>
                </div>
              ))}
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <div className="section-head">
                  <h2>Who needs your attention</h2>
                  <span className={`badge ${state.status === 'Follow up' ? 'good' : ''}`}>
                    {state.status}
                  </span>
                </div>
                <div className="lead-row row spread">
                  <div className="row">
                    <span className="avatar">01</span>
                    <div>
                      <h3>Your test lead</h3>
                      <p>{allowedPhone} · Simulated CRM</p>
                    </div>
                  </div>
                  <MessageCircle size={22} />
                </div>
                <p>{summary?.requirements}</p>
                <div className="next-action" style={{ marginTop: 18 }}>
                  <span className="mono">NEXT ADVISOR ACTION</span>
                  <p>{summary?.action}</p>
                </div>
                <Link href="/leads" className="btn" style={{ marginTop: 20 }}>
                  Review WhatsApp thread <ArrowRight />
                </Link>
              </section>
              <aside className="panel dark">
                <div className="eyebrow">Live buyer brief</div>
                <h2>
                  {state.messages.length
                    ? 'What the buyer is telling you.'
                    : 'Waiting for WhatsApp.'}
                </h2>
                <p style={{ marginTop: 16 }}>{summary?.requirements}</p>
                <div className="summary-rule" />
                {summary?.evidence.length ? (
                  <blockquote className="evidence">
                    “{summary.evidence.at(-1)?.text}”
                    <cite>Exact buyer message · WhatsApp</cite>
                  </blockquote>
                ) : (
                  <div className="row spread">
                    <span className="mono">NO CONVERSATION DATA YET</span>
                    <Smartphone size={23} />
                  </div>
                )}
              </aside>
            </div>
            <section className="properties-preview">
              <div className="section-head">
                <h2>
                  {state.requirements.budget
                    ? 'Homes that fit the brief'
                    : 'Sample Gurgaon inventory'}
                </h2>
                <Link className="btn small" href="/properties">
                  Browse all <ArrowUpRight />
                </Link>
              </div>
              <div className="property-grid">
                {(state.requirements.budget ? matching : state.properties)
                  .slice(0, 3)
                  .map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onOpen={setSelected}
                    />
                  ))}
              </div>
            </section>
          </>
        )}

        {state && section === 'leads' && (
          <div className="lead-layout">
            <aside className="panel lead-list">
              <div className="eyebrow">Demo CRM · 1 lead</div>
              <div className="selected-lead">
                <strong>Your test lead</strong>
                <p>{allowedPhone}</p>
                <span className="badge">{state.status}</span>
              </div>
            </aside>
            <section className="panel chat-panel">
              <div className="section-head">
                <div>
                  <h2>WhatsApp transcript</h2>
                  <p>Read-only mirror · refreshes every 10 seconds</p>
                </div>
                <span className="status">
                  {whatsappLive ? <Wifi size={15} /> : <WifiOff size={15} />}
                  {whatsappLive ? 'Synced' : 'No event yet'}
                </span>
              </div>
              <div className="transcript">
                {!state.messages.length ? (
                  <div className="empty">
                    <MessageCircle />
                    <h3>Start in WhatsApp</h3>
                    <p>
                      Message {allowedPhone} from the linked personal account.
                      This page never sends or simulates buyer messages.
                    </p>
                  </div>
                ) : (
                  state.messages.map((message) => (
                    <div
                      className={`bubble ${message.role === 'buyer' ? 'buyer' : ''}`}
                      key={message.id}
                    >
                      <span className="bubble-label">
                        {message.role === 'buyer' ? 'BUYER' : 'ESTATE AGENT'} ·{' '}
                        {message.channel === 'whatsapp' ? 'WHATSAPP' : 'IMPORTED'}
                      </span>
                      <p>{message.text}</p>
                      <time>{new Date(message.at).toLocaleString('en-IN')}</time>
                    </div>
                  ))
                )}
                <div ref={transcriptEnd} />
              </div>
              <div className="notice row">
                <LockKeyhole size={17} />
                Conversation input is deliberately absent. Replies happen only in
                WhatsApp.
              </div>
            </section>
            <aside className="panel dark brief-panel">
              <div>
                <div className="eyebrow">Lead summary</div>
                <h2>{state.status}</h2>
                <dl className="brief-list">
                  <div>
                    <dt>Brief</dt>
                    <dd>{summary?.requirements}</dd>
                  </div>
                  <div>
                    <dt>Matches</dt>
                    <dd>{summary?.matches}</dd>
                  </div>
                  <div>
                    <dt>Blocked asks</dt>
                    <dd>{state.blocked}</dd>
                  </div>
                </dl>
              </div>
              <div className="next-action">
                <span className="mono">WHAT TO DO NEXT</span>
                <p>{summary?.action}</p>
              </div>
              {state.interestedId && (
                <button className="btn light" onClick={() => setMeetingOpen(true)}>
                  Propose a viewing <CalendarDays />
                </button>
              )}
            </aside>
          </div>
        )}

        {state && section === 'properties' && (
          <>
            <div className="panel dataset-banner">
              <div className="row">
                <Database />
                <div>
                  <h3>Gurgaon house listings · Kaggle</h3>
                  <p>
                    120 dashboard samples selected from 3,909 historical rows.
                    Prices are converted from crores to INR lakhs.
                  </p>
                </div>
              </div>
              <a
                className="btn dark"
                href="/gurgaon-house-listings-kaggle.csv"
                download
              >
                <Download /> Download full CSV
              </a>
            </div>
            <div className="filters">
              <div className="search-box">
                <Search />
                <input
                  aria-label="Search listings"
                  placeholder="Sector, society or listing ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                aria-label="Bedrooms"
                value={beds}
                onChange={(event) => setBeds(Number(event.target.value))}
              >
                <option value="0">Any bedrooms</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} BHK
                  </option>
                ))}
              </select>
              <input
                className="budget-input"
                aria-label="Maximum price in lakhs"
                type="number"
                min="1"
                placeholder="Max ₹ lakh"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                ref={fileInput}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void parseUpload(file);
                }}
              />
            </div>
            <div className="section-head">
              <h2>{shown.length} listings</h2>
              <span className="footnote">
                Historical test data—not live inventory or an offer.
              </span>
            </div>
            <div className="property-grid">
              {shown.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onOpen={setSelected}
                />
              ))}
            </div>
          </>
        )}

        {state && section === 'connections' && (
          <div className="stack">
            <section className="panel integration-card">
              <div className="row">
                <span className="integration-icon">
                  <MessageCircle />
                </span>
                <div>
                  <h2>WhatsApp personal account</h2>
                  <p>
                    Account <strong>shellsworth</strong> · sender{' '}
                    {state.phone || 'not associated'}
                  </p>
                </div>
              </div>
              <span className={`badge ${whatsappLive ? 'good' : ''}`}>
                {whatsappLive ? 'Events received' : 'Waiting for first message'}
              </span>
            </section>
            <section className="panel integration-card">
              <div className="row">
                <span className="integration-icon">
                  <Database />
                </span>
                <div>
                  <h2>Simulated CRM</h2>
                  <p>Exactly one contact is exposed to the agent.</p>
                </div>
              </div>
              <span className="badge good">
                <Check size={13} /> Connected
              </span>
            </section>
            <section className="panel">
              <div className="section-head">
                <h2>Available contacts</h2>
                <span className="badge">Allowlist enforced</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Permission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Your test lead</TableCell>
                    <TableCell>{allowedPhone}</TableCell>
                    <TableCell>Simulated CRM</TableCell>
                    <TableCell>
                      <span className="badge good">
                        <Check size={13} /> Only allowed contact
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>
            <section className="panel bone two-col">
              <div>
                <div className="eyebrow">How sync works</div>
                <h2>WhatsApp → OpenClaw → dashboard</h2>
              </div>
              <ol className="policy-list">
                <li>Messages begin and continue in WhatsApp.</li>
                <li>OpenClaw handles only the allowlisted direct chat.</li>
                <li>A local event hook mirrors inbound and outbound text here.</li>
                <li>The dashboard extracts requirements and advisor next steps.</li>
              </ol>
            </section>
          </div>
        )}

        {state && section === 'agent' && (
          <div className="dashboard-grid">
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>Estate Desk agent</h2>
                  <p>Dedicated WhatsApp personality for {allowedPhone}</p>
                </div>
                <span className="badge good">
                  <Check size={13} /> Active in OpenClaw
                </span>
              </div>
              <div className="notice row">
                {state.agentEnabled ? <Play size={17} /> : <Pause size={17} />}
                Dashboard qualification is active. Pause the WhatsApp account in
                OpenClaw to stop replies and sync together.
              </div>
              <ul className="policy-list">
                <li>May ask for budget, bedrooms, sector and buying timeline.</li>
                <li>May explain only listings in the uploaded property catalog.</li>
                <li>May identify explicit interest and request an advisor viewing.</li>
                <li>Must honor STOP and remain opted out until START.</li>
                <li>Cannot browse, execute commands, access secrets or contact others.</li>
              </ul>
            </section>
            <aside className="panel dark">
              <div className="eyebrow">Enforcement</div>
              <h2>Prompting is one layer, not the lock.</h2>
              <p style={{ marginTop: 18 }}>
                The WhatsApp route is bound to one direct peer, the agent has an
                isolated workspace, and its tools are denied. The dashboard accepts
                only signed events for that exact account and number.
              </p>
              <div className="summary-rule" />
              <div className="row spread">
                <span className="mono">OUT-OF-SCOPE REQUESTS BLOCKED</span>
                <span className="metric">{state.blocked}</span>
              </div>
              <p style={{ marginTop: 18 }}>
                No system can honestly promise universal jailbreak immunity; these
                controls minimize what a confused model can do.
              </p>
            </aside>
          </div>
        )}

        {state && section === 'login' && (
          <div className="login-layout">
            <section className="panel">
              <div className="eyebrow">Sender setup</div>
              <h2>Your personal WhatsApp number</h2>
              <p>
                This associates the already-linked OpenClaw account with your
                dashboard. It does not pair WhatsApp in the browser.
              </p>
              <div className="phone-number">{state.phone || allowedPhone}</div>
              {!codeSent ? (
                <div className="fields">
                  <label className="field">
                    Phone number
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      inputMode="tel"
                    />
                  </label>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void phoneAction('send')}
                  >
                    Continue <ArrowRight />
                  </button>
                </div>
              ) : (
                <div className="fields">
                  <p>{phoneInfo}</p>
                  <InputOTP maxLength={6} value={code} onChange={setCode}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((slot) => (
                        <InputOTPSlot key={slot} index={slot} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <button
                    className="btn primary"
                    disabled={busy || code.length !== 6}
                    onClick={() => void phoneAction('verify')}
                  >
                    Associate number <Check />
                  </button>
                </div>
              )}
            </section>
            <aside className="panel dark">
              <div className="eyebrow">Current test scope</div>
              <h2>One number on both sides.</h2>
              <ol className="setup-steps">
                <li>
                  <span>01</span>
                  <div>
                    <strong>Sender</strong>
                    <p>{allowedPhone}, your linked personal account.</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>Recipient</strong>
                    <p>{allowedPhone}, used as a self-chat test lead.</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>Dashboard</strong>
                    <p>Mirrors the resulting thread and highlights follow-up.</p>
                  </div>
                </li>
              </ol>
            </aside>
          </div>
        )}

        <footer className="footer">
          <span>Estate Desk / Better property conversations.</span>
          <span>Conversation channel: WhatsApp · Dashboard: read-only</span>
        </footer>
      </main>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl property-dialog">
          {selected && (
            <>
              <img
                className="detail-photo"
                src={selected.image}
                alt="Illustrative apartment interior"
              />
              <DialogTitle>
                {selected.id} · {selected.bedrooms} BHK
              </DialogTitle>
              <DialogDescription>
                {selected.location}
                {selected.society ? ` · ${selected.society}` : ''}
              </DialogDescription>
              <div className="metrics property-metrics">
                <div className="stat">
                  <label>Price</label>
                  <strong>₹{selected.priceLakhs}L</strong>
                </div>
                <div className="stat">
                  <label>Area</label>
                  <strong>{selected.sqft} sq ft</strong>
                </div>
                <div className="stat">
                  <label>Bathrooms</label>
                  <strong>{selected.bathrooms ?? '—'}</strong>
                </div>
                <div className="stat">
                  <label>Type</label>
                  <strong>{selected.areaType}</strong>
                </div>
              </div>
              <div className="notice">
                Historical Kaggle record from source row {selected.sourceRow}.
                Verify the owner, current price and availability before presenting
                it as live inventory.
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>Propose an advisor viewing</DialogTitle>
          <DialogDescription>
            {interested?.id} · {interested?.location}. This creates an internal
            proposal; it does not message the buyer or book a calendar event.
          </DialogDescription>
          <div className="fields">
            <label className="field">
              Proposed date and time
              <input
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="field">
              Internal note
              <textarea
                value={meetingNote}
                onChange={(event) => setMeetingNote(event.target.value)}
              />
            </label>
            <button
              className="btn primary"
              disabled={busy || !date}
              onClick={async () => {
                if (
                  await action({
                    action: 'meeting',
                    date: new Date(date).toISOString(),
                    note: meetingNote,
                  })
                ) {
                  setMeetingOpen(false);
                  setFeedback('Viewing proposal saved for advisor confirmation.');
                }
              }}
            >
              Save proposal <CalendarDays />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!upload} onOpenChange={(open) => !open && setUpload(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>Review property import</DialogTitle>
          <DialogDescription>
            {uploadName} · {upload?.length} listings. Prices must be INR lakhs.
          </DialogDescription>
          <div className="import-preview">
            {upload?.slice(0, 5).map((property, index) => (
              <div className="lead-row" key={index}>
                {String(property.location)} · {String(property.bedrooms)} BHK · ₹
                {String(property.priceLakhs)} lakh
              </div>
            ))}
          </div>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              if (await action({ action: 'upload', properties: upload })) {
                setUpload(null);
                setFeedback('Properties imported for matching.');
              }
            }}
          >
            Import {upload?.length} properties <Upload />
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
