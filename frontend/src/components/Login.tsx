import { ArrowRight, ShieldCheck } from 'lucide-react';
import { authUrl } from '../lib/api';

export function Login({ message }: { message?: string | null }) {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark large"><span>O</span>MB</div>
        <h1>Login</h1>
        <p className="login-subtitle">Sign in to your ReachInbox workspace</p>
        {message && <div className="login-error" role="alert">{message}</div>}
        <div className="login-security"><ShieldCheck size={16} /><span>Secure workspace access</span></div>
        <a className="google-button" href={authUrl('/auth/google')}>
          <span className="google-g">G</span>
          Continue with Google
          <ArrowRight size={16} />
        </a>
        <p className="login-note">Only your profile identity is used. Your mailbox credentials stay private.</p>
      </div>
    </main>
  );
}
