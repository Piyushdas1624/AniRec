import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [emailOrUsername, setEmailOrUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailOrUsername || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            await login(emailOrUsername, password);
            toast.success('Welcome back!');
            navigate('/');
        } catch (err: any) {
            toast.error(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container animate-fade-in">
                <div className="auth-header">
                    <div className="auth-logo">
                        <Sparkles size={28} />
                        <span>AniRec AI</span>
                    </div>
                    <p className="auth-subtitle">AI-Powered Anime Recommendations</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <h2 className="auth-title">Welcome Back</h2>

                    <div className="input-group">
                        <label htmlFor="login-email">Email or Username</label>
                        <input
                            id="login-email"
                            className="input"
                            type="text"
                            placeholder="Enter email or username"
                            value={emailOrUsername}
                            onChange={e => setEmailOrUsername(e.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="login-password">Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="login-password"
                                className="input"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-gradient btn-lg w-full"
                        disabled={loading}
                    >
                        {loading ? 'Logging in...' : 'Log In'}
                    </button>

                    <p className="auth-switch">
                        Don't have an account? <Link to="/signup">Sign up</Link>
                    </p>
                </form>
            </div>

            <style>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .auth-container {
          width: 100%;
          max-width: 420px;
        }
        .auth-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .auth-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 800;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .auth-logo svg {
          color: var(--accent-primary);
          -webkit-text-fill-color: initial;
        }
        .auth-subtitle {
          color: var(--text-secondary);
          margin-top: 4px;
          font-size: 0.9rem;
        }
        .auth-form {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          padding: 32px;
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .auth-title {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 700;
          text-align: center;
        }
        .auth-switch {
          text-align: center;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .auth-switch a {
          font-weight: 600;
        }
      `}</style>
        </div>
    );
}
