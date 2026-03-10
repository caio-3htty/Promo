import { FormEvent, useEffect, useState } from "react";

import { supabase } from "./supabase";

type TemplateVersion = {
  id: string;
  version_name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

const ownerDb = (supabase as any).schema("owner_control");

const App = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([]);
  const [versionName, setVersionName] = useState("");
  const [payloadJson, setPayloadJson] = useState('{"userTypes": []}');
  const [notes, setNotes] = useState("");

  const [activationVersionId, setActivationVersionId] = useState("");
  const [activationTenantId, setActivationTenantId] = useState("");

  const [restoreEntityTable, setRestoreEntityTable] = useState("pedidos_compra");
  const [restoreEntityId, setRestoreEntityId] = useState("");
  const [restoreReason, setRestoreReason] = useState("");

  const [fieldEntityTable, setFieldEntityTable] = useState("pedidos_compra");
  const [fieldEntityId, setFieldEntityId] = useState("");
  const [fieldAuditLogId, setFieldAuditLogId] = useState("");
  const [fieldReason, setFieldReason] = useState("");

  useEffect(() => {
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        await checkOwnerAndLoad(data.session.user.id);
      }
      setSessionReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await checkOwnerAndLoad(session.user.id);
      } else {
        setIsOwner(false);
        setTemplateVersions([]);
      }
    });

    void bootstrap();
    return () => subscription.unsubscribe();
  }, []);

  const checkOwnerAndLoad = async (userId: string) => {
    setBusy(true);
    setError("");

    const ownerRpc = await (supabase as any).rpc("is_owner_account", { _user_id: userId });
    if (ownerRpc.error) {
      setBusy(false);
      setError(ownerRpc.error.message);
      return;
    }

    const owner = Boolean(ownerRpc.data);
    setIsOwner(owner);

    if (!owner) {
      setBusy(false);
      setError("Usuário autenticado, mas sem permissão no owner_control.owner_accounts.");
      return;
    }

    await loadTemplateVersions();
    setBusy(false);
  };

  const loadTemplateVersions = async () => {
    const { data, error: loadError } = await ownerDb
      .from("template_versions")
      .select("id, version_name, notes, is_active, created_at")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setTemplateVersions((data ?? []) as TemplateVersion[]);
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

    setMessage("Login efetuado com sucesso.");
    setBusy(false);
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    await supabase.auth.signOut();
    setIsOwner(false);
    setTemplateVersions([]);
    setBusy(false);
  };

  const publishTemplate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payloadJson);
    } catch {
      setError("Payload JSON inválido.");
      setBusy(false);
      return;
    }

    const { data, error: rpcError } = await (supabase as any).rpc("owner_publish_template_version", {
      _version_name: versionName,
      _payload: parsedPayload,
      _notes: notes || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    setMessage(`Template publicado com id ${data}.`);
    setVersionName("");
    setNotes("");
    await loadTemplateVersions();
    setBusy(false);
  };

  const activateTemplate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { error: rpcError } = await (supabase as any).rpc("owner_activate_template_version", {
      _version_id: activationVersionId,
      _tenant_id: activationTenantId || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    setMessage("Template ativado com sucesso.");
    await loadTemplateVersions();
    setBusy(false);
  };

  const restoreSoftDelete = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { data, error: rpcError } = await (supabase as any).rpc("owner_restore_soft_deleted", {
      _entity_table: restoreEntityTable,
      _entity_id: restoreEntityId,
      _reason: restoreReason || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    setMessage(`Restauração concluída: ${JSON.stringify(data)}`);
    setBusy(false);
  };

  const restoreFieldVersion = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const { data, error: rpcError } = await (supabase as any).rpc("owner_restore_field_version", {
      _entity_table: fieldEntityTable,
      _entity_id: fieldEntityId,
      _audit_log_id: fieldAuditLogId,
      _reason: fieldReason || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    setMessage(`Versão restaurada: ${JSON.stringify(data)}`);
    setBusy(false);
  };

  if (!sessionReady) {
    return <div className="container">Carregando sessão...</div>;
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Prumo Owner Windows</h1>
          <div className="subtitle">Recuperação e templates globais (sem CRUD operacional).</div>
        </div>
        {isOwner && (
          <button type="button" className="secondary" onClick={logout} disabled={busy}>
            Sair
          </button>
        )}
      </div>

      {!isOwner && (
        <form className="card" onSubmit={login}>
          <h3>Login owner</h3>
          <div className="grid">
            <div>
              <label htmlFor="email">E-mail</label>
              <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="submit" className="primary" disabled={busy}>
              Entrar
            </button>
          </div>
        </form>
      )}

      {isOwner && (
        <>
          <form className="card" onSubmit={publishTemplate}>
            <h3>Publicar versão de template</h3>
            <div className="grid">
              <div>
                <label htmlFor="versionName">Nome da versão</label>
                <input
                  id="versionName"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="notes">Notas</label>
                <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="payload">Payload JSON</label>
              <textarea
                id="payload"
                value={payloadJson}
                onChange={(e) => setPayloadJson(e.target.value)}
                required
              />
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="submit" className="primary" disabled={busy}>
                Publicar
              </button>
            </div>
          </form>

          <form className="card" onSubmit={activateTemplate}>
            <h3>Ativar versão de template</h3>
            <div className="grid">
              <div>
                <label htmlFor="activationVersion">Version ID</label>
                <input
                  id="activationVersion"
                  value={activationVersionId}
                  onChange={(e) => setActivationVersionId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="activationTenant">Tenant ID (opcional)</label>
                <input
                  id="activationTenant"
                  value={activationTenantId}
                  onChange={(e) => setActivationTenantId(e.target.value)}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="submit" className="primary" disabled={busy}>
                Ativar
              </button>
            </div>
          </form>

          <form className="card" onSubmit={restoreSoftDelete}>
            <h3>Restaurar soft delete</h3>
            <div className="grid">
              <div>
                <label htmlFor="restoreEntityTable">Tabela</label>
                <select
                  id="restoreEntityTable"
                  value={restoreEntityTable}
                  onChange={(e) => setRestoreEntityTable(e.target.value)}
                >
                  <option value="obras">obras</option>
                  <option value="fornecedores">fornecedores</option>
                  <option value="materiais">materiais</option>
                  <option value="material_fornecedor">material_fornecedor</option>
                  <option value="pedidos_compra">pedidos_compra</option>
                </select>
              </div>
              <div>
                <label htmlFor="restoreEntityId">Entity ID</label>
                <input
                  id="restoreEntityId"
                  value={restoreEntityId}
                  onChange={(e) => setRestoreEntityId(e.target.value)}
                  required
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="restoreReason">Motivo</label>
              <input
                id="restoreReason"
                value={restoreReason}
                onChange={(e) => setRestoreReason(e.target.value)}
              />
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="submit" className="primary" disabled={busy}>
                Restaurar
              </button>
            </div>
          </form>

          <form className="card" onSubmit={restoreFieldVersion}>
            <h3>Restaurar versão de campo crítico</h3>
            <div className="grid">
              <div>
                <label htmlFor="fieldEntityTable">Tabela</label>
                <select
                  id="fieldEntityTable"
                  value={fieldEntityTable}
                  onChange={(e) => setFieldEntityTable(e.target.value)}
                >
                  <option value="pedidos_compra">pedidos_compra</option>
                  <option value="material_fornecedor">material_fornecedor</option>
                </select>
              </div>
              <div>
                <label htmlFor="fieldEntityId">Entity ID</label>
                <input id="fieldEntityId" value={fieldEntityId} onChange={(e) => setFieldEntityId(e.target.value)} required />
              </div>
            </div>
            <div className="grid" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="fieldAuditLogId">Audit Log ID</label>
                <input
                  id="fieldAuditLogId"
                  value={fieldAuditLogId}
                  onChange={(e) => setFieldAuditLogId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="fieldReason">Motivo</label>
                <input id="fieldReason" value={fieldReason} onChange={(e) => setFieldReason(e.target.value)} />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button type="submit" className="primary" disabled={busy}>
                Restaurar versão
              </button>
            </div>
          </form>

          <div className="card">
            <h3>Versões de template publicadas</h3>
            {templateVersions.length === 0 ? (
              <div>Nenhuma versão encontrada.</div>
            ) : (
              <ul>
                {templateVersions.map((item) => (
                  <li key={item.id} style={{ marginBottom: 8 }}>
                    <strong>{item.version_name}</strong> ({item.id}) - {item.is_active ? "ativa" : "inativa"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {message && <div className="message">{message}</div>}
      {error && <div className="message error">{error}</div>}
      {busy && <div className="message">Processando...</div>}
    </div>
  );
};

export default App;
