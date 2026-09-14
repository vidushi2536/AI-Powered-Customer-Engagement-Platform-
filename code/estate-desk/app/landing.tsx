'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Check,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

export default function Landing() {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    void fetch('/api/auth', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Could not check the current session.');
        const body = await response.text();
        if (!body) throw new Error('The session check returned no data.');
        return JSON.parse(body) as unknown;
      })
      .then((value: unknown) => {
        const result = value as {
          authenticated?: boolean;
          onboardingComplete?: boolean;
        };
        if (result.authenticated)
          window.location.replace(
            result.onboardingComplete ? '/dashboard' : '/onboarding',
          );
      })
      .catch(() => {
        setError('Could not check the current session. You can still sign in.');
      });
  }, []);

  async function authenticate(action: 'send' | 'verify') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, phone, code }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Could not verify this number.');
      if (action === 'send') {
        setCodeSent(true);
        setInfo(result.message || 'Code sent.');
      } else {
        window.location.assign('/onboarding');
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not verify this number.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="landing-brand" href="/">
          <span>
            <Building2 size={19} />
          </span>
          Estate Desk
        </Link>
        <p>WhatsApp property intelligence</p>
      </nav>

      <section className="landing-grid">
        <div className="landing-copy">
          <p className="eyebrow">A clearer sales desk</p>
          <h1>Turn property conversations into your next move.</h1>
          <p className="landing-lede">
            Connect a consented CRM list and property catalog. Estate Desk turns
            WhatsApp replies into useful lead statistics for your team.
          </p>
          <div className="landing-points">
            <p>
              <Check size={17} /> Buyers keep chatting in WhatsApp
            </p>
            <p>
              <Check size={17} /> Your dashboard stays focused on statistics
            </p>
            <p>
              <Check size={17} /> STOP and opt-out rules are enforced
            </p>
          </div>
          <div className="landing-signal" aria-label="How Estate Desk works">
            <span>
              <MessageCircle size={19} /> WhatsApp
            </span>
            <ArrowRight size={17} />
            <span>
              <ShieldCheck size={19} /> Scoped agent
            </span>
            <ArrowRight size={17} />
            <span>
              <Building2 size={19} /> Dashboard
            </span>
          </div>
        </div>

        <div className="phone-card">
          <div
            className="auth-switch"
            role="tablist"
            aria-label="Account action"
          >
            <button
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => setMode('signup')}
              role="tab"
              aria-selected={mode === 'signup'}
            >
              Sign up
            </button>
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
              role="tab"
              aria-selected={mode === 'login'}
            >
              Log in
            </button>
          </div>
          <p className="card-kicker">
            {mode === 'signup' ? 'Create your workspace' : 'Welcome back'}
          </p>
          <h2>Continue with your phone</h2>
          <p className="card-help">
            We use this number to protect your dashboard—not to contact your CRM
            leads.
          </p>
          <label htmlFor="account-phone">Mobile number</label>
          <div className="phone-field">
            <span>+</span>
            <input
              id="account-phone"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/[^\d]/g, '').slice(0, 15))
              }
              inputMode="tel"
              autoComplete="tel"
              placeholder="91 98765 43210"
            />
          </div>
          {codeSent && (
            <div className="otp-block">
              <label htmlFor="verification-code">Verification code</label>
              <InputOTP
                id="verification-code"
                maxLength={6}
                value={code}
                onChange={setCode}
              >
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {info && <p className="auth-info">{info}</p>}
            </div>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-auth"
            type="button"
            disabled={busy || !phone || (codeSent && code.length !== 6)}
            onClick={() => void authenticate(codeSent ? 'verify' : 'send')}
          >
            {busy
              ? 'Please wait…'
              : codeSent
                ? 'Verify and continue'
                : 'Send verification code'}
            {!busy && <ArrowRight size={18} />}
          </button>
          <p className="auth-footnote">
            By continuing, you confirm you are authorised to use this number.
          </p>
        </div>
      </section>
    </main>
  );
}
