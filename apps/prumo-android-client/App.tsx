import { useEffect, useState } from "react";
import { Button, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { createClient } from "@supabase/supabase-js";

type LinkedObra = {
  obra_id: string;
  obras: {
    name: string;
    status: string;
  } | null;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [role, setRole] = useState<string>("-");
  const [obras, setObras] = useState<LinkedObra[]>([]);
  const [message, setMessage] = useState("Informe credenciais para login.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await loadAccess(session.user.id);
      } else {
        setIsActive(false);
        setRole("-");
        setObras([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadAccess = async (userId: string) => {
    if (!supabase) return;

    const [profileRes, roleRes, obrasRes] = await Promise.all([
      supabase.from("profiles").select("is_active").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("user_obras").select("obra_id, obras(name, status)").eq("user_id", userId),
    ]);

    if (profileRes.error || roleRes.error || obrasRes.error) {
      setMessage(profileRes.error?.message || roleRes.error?.message || obrasRes.error?.message || "Erro ao carregar acesso");
      return;
    }

    setIsActive(Boolean(profileRes.data?.is_active));
    setRole((roleRes.data?.role as string) ?? "-");
    setObras((obrasRes.data ?? []) as unknown as LinkedObra[]);
    setMessage("Acesso carregado.");
  };

  const login = async () => {
    if (!supabase) {
      setMessage("Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setMessage("Login realizado com sucesso.");
    if (data.user?.id) {
      await loadAccess(data.user.id);
    }
    setBusy(false);
  };

  const logout = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setMessage("Sessão encerrada.");
    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>Prumo Android Client</Text>
        <Text style={{ color: "#475569" }}>Aplicativo mobile conectado ao mesmo Supabase.</Text>

        <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 10 }}>
          <Text style={{ fontWeight: "700" }}>Login</Text>
          <TextInput
            placeholder="email@empresa.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10 }}
          />
          <TextInput
            placeholder="senha"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10 }}
          />
          <Button title={busy ? "Processando..." : "Entrar"} onPress={login} disabled={busy} />
          <Button title="Sair" onPress={logout} disabled={busy} color="#475569" />
        </View>

        <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Resumo de acesso</Text>
          <Text>Ativo: {isActive ? "sim" : "não"}</Text>
          <Text>Papel: {role}</Text>
          <Text>Obras vinculadas: {obras.length}</Text>
        </View>

        <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Obras</Text>
          {obras.length === 0 ? (
            <Text>Nenhuma obra vinculada.</Text>
          ) : (
            obras.map((item) => (
              <Text key={item.obra_id}>- {item.obras?.name ?? item.obra_id} ({item.obras?.status ?? "-"})</Text>
            ))
          )}
        </View>

        <Text style={{ color: "#0f766e" }}>{message}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
