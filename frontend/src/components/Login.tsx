import { ArrowRight, Mail } from 'lucide-react';

export function Login({ message }: { message?: string | null }) {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark large"><span>O</span>MB</div>
        <h1>Login</h1>
        <p className="login-subtitle">Sign in to your ReachInbox workspace</p>
        {message && <div className="login-error" role="alert">{message}</div>}
        <a className="google-button" href="/auth/google">
          <span className="google-g">G</span>
          Login with Google
          <ArrowRight size={16} />
        </a>
        <div className="login-divider"><span />or sign up through email<span /></div>
        <form className="email-login" onSubmit={(event) => event.preventDefault()}>
          <label className="sr-only" htmlFor="email">Email ID</label>
          <div className="login-input"><Mail size={17} /><input id="email" type="email" placeholder="Email ID" disabled /></div>
          <label className="sr-only" htmlFor="password">Password</label>
          <input id="password" type="password" placeholder="Password" disabled />
          <button type="button" className="login-submit" disabled>Login</button>
          <p className="login-note">Email and password sign-in is not enabled for this workspace.</p>
        </form>
      </div>
    </main>
  );
}
