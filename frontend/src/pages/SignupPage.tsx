import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !username || !password) {
            toast.error('Please fill in all required fields');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        try {
            await signup(email, username, displayName || username, password);
            toast.success('Account created! Welcome!');
            navigate('/');
        } catch (err: any) {
            toast.error(err.message || 'Signup failed');
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
                    <h2 className="auth-title">Create Account</h2>

                    <div className="input-group">
                        <label htmlFor="signup-email">Email *</label>
                        <input
                            id="signup-email"
                            className="input"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="signup-username">Username *</label>
                        <input
                            id="signup-username"
                            className="input"
                            type="text"
                            placeholder="Choose a username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="signup-display-name">Display Name</label>
                        <input
                            id="signup-display-name"
                            className="input"
                            type="text"
                            placeholder="Your display name (optional)"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="signup-password">Password *</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                id="signup-password"
                                className="input"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Min 6 characters"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="signup-confirm">Confirm Password *</label>
                        <input
                            id="signup-confirm"
                            className="input"
                            type="password"
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-gradient btn-lg w-full" disabled={loading}>
                        {loading ? 'Creating account...' : 'Create Account'}
                    </button>

                    <p className="auth-switch">
                        Already have an account? <Link to="/login">Log in</Link>
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
        .auth-container { width: 100%; max-width: 420px; }
        .auth-header { text-align: center; margin-bottom: 32px; }
        .auth-logo {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          font-family: var(--font-display); font-size: 2rem; font-weight: 800;
          background: var(--accent-gradient);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .auth-logo svg { color: var(--accent-primary); -webkit-text-fill-color: initial; }
        .auth-subtitle { color: var(--text-secondary); margin-top: 4px; font-size: 0.9rem; }
        .auth-form {
          background: var(--bg-card); border: 1px solid var(--border-color);
          border-radius: var(--radius-xl); padding: 32px;
          backdrop-filter: blur(20px); display: flex; flex-direction: column; gap: 16px;
        }
        .auth-title { font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; text-align: center; }
        .auth-switch { text-align: center; font-size: 0.85rem; color: var(--text-secondary); }
        .auth-switch a { font-weight: 600; }
      `}</style>
        </div>
    );
}
