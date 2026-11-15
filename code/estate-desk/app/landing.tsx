'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';

export default function Landing() {
  const [error, setError] = useState('');

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get(
      'auth_error',
    );
    if (oauthError)
      setError(
        'Google sign-in could not be completed. Please check the account and try again.',
      );
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

  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <a className="landing-brand" href="/">
          <span>
            <Building2 size={19} />
          </span>
          Estate Desk
        </a>
        <p>Private property intelligence</p>
      </nav>

      <section className="landing-grid">
        <div className="landing-copy">
          <p className="eyebrow">A clearer sales desk</p>
          <h1>Turn property conversations into your next move.</h1>
          <p className="landing-lede">
            Connect a consented CRM list and property catalog. Estate Desk gives
            you a private AI agent, lead history and live insights.
          </p>
          <div className="landing-points">
            <p>
              <Check size={17} /> Your workspace stays private
            </p>
            <p>
              <Check size={17} /> Clients, properties and meetings in one place
            </p>
            <p>
              <Check size={17} /> CRM, listings and agent context stay isolated
            </p>
          </div>
          <div className="landing-signal" aria-label="How Estate Desk works">
            <span>
              <MessageCircle size={19} /> Cloud agent
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

        <div className="phone-card google-card">
          <p className="card-kicker">Your secure workspace</p>
          <h2>Continue with Google</h2>
          <p className="card-help">
            Sign in, add your WhatsApp number, contacts and listings. Nothing
            needs to be installed.
          </p>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <a className="google-auth-button" href="/api/auth/google">
            <span aria-hidden="true">G</span>
            Continue with Google
            <ArrowRight size={18} />
          </a>
          <div className="google-trust-row">
            <ShieldCheck size={17} />
            <span>We request only your basic profile and verified email.</span>
          </div>
          <p className="auth-footnote">
            Your Google password is never shared with Estate Desk.
          </p>
        </div>
      </section>
    </main>
  );
}
