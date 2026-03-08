import { FormEvent, useEffect, useState } from "react";

import { supabase } from "./supabase";

type UserRole = "master" | "gestor" | "engenheiro" | "operacional" | "almoxarife" | null;

type LinkedObra = {
  obra_id: string;
  obras: {
    name: string;
    status: string;
    address: string | null;
  } | null;
};

const App = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [role, setRole] = useState<UserRole>(null);
  const [obras, setObras] = useState<LinkedObra[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        await loadUserAccess(data.session.user.id);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await loadUserAccess(session.user.id);
      } else {
        setIsActive(false);
        setRole(null);
        setObras([]);
      }
    });

    void bootstrap();
    return () => subscription.unsubscribe();
  }, []);

  const loadUserAccess = async (userId: string) => {
    setBusy(true);
    setError("");

    const [profileRes, roleRes, obrasRes] = await Promise.all([
      supabase.from("profiles").select("is_active").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("user_obras").select("obra_id, obras(name, status, address)").eq("user_id", userId),
    ]);

    if (profileRes.error || roleRes.error || obrasRes.error) {
      setError(profileRes.error?.message || roleRes.error?.message || obrasRes.error?.message || "Erro ao carregar acesso");
      setBusy(false);
      return;
    }

    setIsActive(Boolean(profileRes.data?.is_active));
    setRole((roleRes.data?.role as UserRole) ?? null);
    setObras((obrasRes.data ?? []) as unknown as LinkedObra[]);
    setBusy(false);
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError(loginError.message);
      setBusy(false);
      return;
    }

    setMessage("Login realizado.");
    setBusy(false);
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    await supabase.auth.signOut();
    setBusy(false);
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Prumo Windows Client</h1>
          <div>Cliente desktop conectado ao mesmo Supabase do web.</div>
        </div>
        <button type="button" className="secondary" onClick={logout} disabled={busy}>
          Sair
        </button>
      </div>

      <form className="card" onSubmit={login}>
        <h3>Login</h3>
        <div className="grid">
          <div>
            <label htmlFor="email">E-mail</label>
            <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={busy}>Entrar</button>
        </div>
      </form>

      <div className="card">
        <h3>Resumo de acesso</h3>
        <p><strong>Ativo:</strong> {isActive ? "sim" : "não"}</p>
        <p><strong>Papel:</strong> {role ?? "sem papel"}</p>
        <p><strong>Obras vinculadas:</strong> {obras.length}</p>
      </div>

      <div className="card">
        <h3>Obras</h3>
        {obras.length === 0 ? (
          <p>Nenhuma obra vinculada.</p>
        ) : (
          <ul>
            {obras.map((item) => (
              <li key={item.obra_id}>
                {item.obras?.name ?? item.obra_id} - {item.obras?.status ?? "-"}
                {item.obras?.address ? ` (${item.obras.address})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && <div className="status">{message}</div>}
      {error && <div className="status error">{error}</div>}
      {busy && <div className="status">Processando...</div>}
    </div>
  );
};

export default App;
