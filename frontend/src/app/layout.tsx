'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { api } from "@/lib/api";
import "./globals.css";

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  plan?: string;
  creditsUsed?: number;
  creditsLimit?: number;
}

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('creator@marsfield.ai');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [registerName, setRegisterName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    }
  }, []);

  const handleLogin = async (email: string, password: string) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await api.login({ email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setShowLogin(false);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (email: string, password: string, name?: string) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await api.register({ email, password, name: name?.trim() || undefined });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setShowLogin(false);
      setAuthMode('login');
    } catch (err: any) {
      setLoginError(err.message || 'Account creation failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const menuItems = [
    { name: "YouTube Planner", href: "/youtube", icon: "YT" },
    { name: "Video Studio", href: "/", icon: "🎬" },
    { name: "Projects", href: "/projects", icon: "🗂️" },
    { name: "Asset Library", href: "/library", icon: "📁" },
    { name: "Characters & Brands", href: "/kits", icon: "✨" },
    { name: "Settings & API", href: "/settings", icon: "⚙️" },
  ];

  return (
    <AuthContext.Provider value={{ user, token, login: handleLogin, register: handleRegister, logout: handleLogout }}>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#030303" />
        </head>
        <body>
          {/* Persistent Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-logo">
              <span>🌌</span> Marsfield
            </div>
            <ul className="sidebar-menu">
              {menuItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name} className={`sidebar-item ${isActive ? "active" : ""}`}>
                    <Link href={item.href}>
                      <span>{item.icon}</span> {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="sidebar-footer">
              <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
                <Link href="/privacy" style={{ color: "var(--foreground-muted)" }}>Privacy</Link>
                <Link href="/terms" style={{ color: "var(--foreground-muted)" }}>Terms</Link>
              </div>
              {user ? (
                <>
                  <div style={{ fontSize: "0.85rem", color: "var(--foreground-muted)" }}>
                    {user.email}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="badge badge-purple">Connected</span>
                    <button
                      onClick={handleLogout}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--foreground-muted)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        textDecoration: "underline",
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => setShowLogin(true)}
                >
                  Sign In
                </button>
              )}
            </div>
          </aside>

          {/* Content Container */}
          <div className="workspace-container">
            <header className="top-bar">
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 600, fontFamily: "var(--font-display)" }}>
                  {pathname === "/" && "Studio Creative Workspace"}
                  {pathname === "/projects" && "Projects & Storyboards"}
                  {pathname === "/library" && "Asset Vault & Library"}
                  {pathname === "/kits" && "Characters & Brand Kits"}
                  {pathname === "/settings" && "Developer & Studio Settings"}
                  {pathname === "/privacy" && "Privacy Policy"}
                  {pathname === "/terms" && "Terms of Service"}
                </h2>
              </div>
              <div className="top-bar-account" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                {user ? (
                  <>
                    <span className="top-bar-user-label" style={{ fontSize: "0.9rem", fontWeight: 500 }}>{user.name || user.email}</span>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "0.85rem" }}>
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <button className="mobile-only mobile-account-button" onClick={handleLogout}>Logout</button>
                  </>
                ) : (
                  <button className="mobile-sign-in" onClick={() => setShowLogin(true)}>Sign in</button>
                )}
              </div>
            </header>

            <main className="workspace-content">
              {children}
            </main>
          </div>

          <nav className="mobile-nav" aria-label="Primary navigation">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.name} href={item.href} className={isActive ? "active" : ""}>
                  <span aria-hidden="true">{item.icon}</span>
                  <small>{item.name.replace("Video ", "").replace("Asset ", "").replace(" & API", "")}</small>
                </Link>
              );
            })}
          </nav>

          {/* Login Modal Overlay */}
          {showLogin && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                backdropFilter: "blur(6px)",
              }}
              onClick={() => setShowLogin(false)}
            >
              <div
                className="glass-card auth-modal"
                style={{
                  width: "380px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  padding: "2rem",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.3rem" }}>
                  {authMode === 'login' ? 'Sign In to Marsfield' : 'Create your Marsfield account'}
                </h2>
                <p style={{ color: "var(--foreground-muted)", fontSize: "0.85rem", margin: 0 }}>
                  {authMode === 'login'
                    ? 'Enter your credentials to access the studio.'
                    : 'Start with 15 generation credits and your own asset library.'}
                </p>

                {loginError && (
                  <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", padding: "0.75rem", borderRadius: "8px", fontSize: "0.85rem", color: "#ef4444" }}>
                    {loginError}
                  </div>
                )}

                {authMode === 'register' && (
                  <div>
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={registerName}
                      placeholder="Optional"
                      onChange={(e) => setRegisterName(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                  {authMode === 'register' && (
                    <p style={{ color: "var(--foreground-muted)", fontSize: "0.75rem", margin: "0.4rem 0 0" }}>
                      Use at least 8 characters.
                    </p>
                  )}
                </div>
                {authMode === 'register' && (
                  <p style={{ color: "var(--foreground-muted)", fontSize: "0.72rem", margin: 0, lineHeight: 1.5 }}>
                    By creating an account, you agree to the <Link href="/terms" onClick={() => setShowLogin(false)}>Terms of Service</Link> and acknowledge the <Link href="/privacy" onClick={() => setShowLogin(false)}>Privacy Policy</Link>.
                  </p>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "0.5rem" }}
                  onClick={() => {
                    if (authMode === 'login') {
                      void handleLogin(loginEmail, loginPassword);
                    } else {
                      void handleRegister(loginEmail, loginPassword, registerName);
                    }
                  }}
                  disabled={loginLoading}
                >
                  {loginLoading
                    ? authMode === 'login' ? "Signing in..." : "Creating account..."
                    : authMode === 'login' ? "Sign In" : "Create Account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginError('');
                    setAuthMode((mode) => (mode === 'login' ? 'register' : 'login'));
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    textDecoration: "underline",
                  }}
                >
                  {authMode === 'login'
                    ? "Need an account? Create one"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </div>
          )}
        </body>
      </html>
    </AuthContext.Provider>
  );
}
