import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, ErrorMessage } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'Alice (user)', email: 'alice@courtly.test', password: 'password123' },
  { label: 'Bob (user)', email: 'bob@courtly.test', password: 'password123' },
  { label: 'Admin', email: 'admin@courtly.test', password: 'admin123' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-lg font-semibold text-white">C</div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Courtly</h1>
          <p className="mt-1 text-sm text-slate-500">Book padel and tennis courts in seconds.</p>
        </div>
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                className="mt-1 w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorMessage error={error} />
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>
        <div className="mt-4 text-center text-xs text-slate-500">
          <p className="mb-2">Demo accounts (seeded):</p>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                variant="secondary"
                className="px-2.5 py-1 text-xs"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
