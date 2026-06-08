/**
 * Supabase email magic-link login (whitelist checked before OTP).
 */
(function () {
  let client = null;

  function requireConfig() {
    const cfg = window.TSupabaseConfig ?? {};
    if (!cfg.url || !cfg.anonKey) {
      throw new Error("Supabase 설정이 없습니다.");
    }
    return cfg;
  }

  function getClient() {
    if (!client) {
      const cfg = requireConfig();
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return client;
  }

  async function sendLoginLink(email) {
    const addr = `${email ?? ""}`.trim().toLowerCase();
    if (!addr.includes("@")) throw new Error("올바른 이메일을 입력하세요.");

    const allowed = await window.TSupabase.checkEmailAllowed(addr);
    if (!allowed) throw new Error("허용되지 않은 이메일입니다. 관리자에게 등록을 요청하세요.");

    const { error } = await getClient().auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.href.split("#")[0] }
    });
    if (error) throw new Error(error.message);
    return true;
  }

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  }

  async function requireSession() {
    const session = await getSession();
    if (!session?.user?.email) throw new Error("로그인이 필요합니다.");
    return session;
  }

  async function getUserEmail() {
    const session = await getSession();
    return session?.user?.email?.toLowerCase() ?? "";
  }

  async function signOut() {
    await getClient().auth.signOut();
  }

  function onAuthStateChange(cb) {
    return getClient().auth.onAuthStateChange((_event, session) => cb(session));
  }

  window.TAuth = {
    sendLoginLink,
    getSession,
    requireSession,
    getUserEmail,
    signOut,
    onAuthStateChange,
    getAccessToken: async () => (await getSession())?.access_token ?? ""
  };
})();
