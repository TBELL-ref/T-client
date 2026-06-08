/**
 * Supabase email + password login (whitelist checked before auth).
 * First-time setup: one password-reset email, then password-only sign-in.
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

  function normalizeEmail(email) {
    const addr = `${email ?? ""}`.trim().toLowerCase();
    if (!addr.includes("@")) throw new Error("올바른 이메일을 입력하세요.");
    return addr;
  }

  function redirectBase() {
    return window.location.href.split("#")[0];
  }

  async function assertAllowedEmail(email) {
    const allowed = await window.TSupabase.checkEmailAllowed(email);
    if (!allowed) throw new Error("허용되지 않은 이메일입니다. 관리자에게 등록을 요청하세요.");
  }

  function mapAuthError(message) {
    const m = `${message ?? ""}`.toLowerCase();
    if (m.includes("rate limit")) {
      return "메일 발송 한도를 초과했습니다. 1시간 후 다시 시도하거나, 관리자에게 비밀번호 직접 설정을 요청하세요.";
    }
    if (m.includes("only request this after") || m.includes("security purposes")) {
      return "보안상 잠시 후에만 재발송할 수 있습니다. 1~2분 뒤 다시 시도해 주세요.";
    }
    if (m.includes("email address not authorized") || m.includes("invalid email")) {
      return "이메일 형식이 올바르지 않거나 발송 설정(SMTP)을 확인해야 합니다.";
    }
    return message;
  }

  async function signInWithPassword(email, password) {
    const addr = normalizeEmail(email);
    const pwd = `${password ?? ""}`;
    if (pwd.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");

    await assertAllowedEmail(addr);

    const { error } = await getClient().auth.signInWithPassword({
      email: addr,
      password: pwd
    });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        throw new Error("이메일 또는 비밀번호가 올바르지 않습니다. 처음이면 관리자에게 비밀번호 설정을 요청하세요.");
      }
      throw new Error(mapAuthError(error.message));
    }
    return true;
  }

  /** One-time (or forgot-password) setup email — Supabase Auth SMTP required for Gmail delivery. */
  async function sendPasswordSetupEmail(email) {
    const addr = normalizeEmail(email);
    await assertAllowedEmail(addr);

    const { error } = await getClient().auth.resetPasswordForEmail(addr, {
      redirectTo: redirectBase()
    });
    if (error) throw new Error(mapAuthError(error.message));
    return true;
  }

  async function updatePassword(password) {
    const pwd = `${password ?? ""}`;
    if (pwd.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");

    const { error } = await getClient().auth.updateUser({ password: pwd });
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
    return getClient().auth.onAuthStateChange((event, session) => cb(event, session));
  }

  window.TAuth = {
    signInWithPassword,
    sendPasswordSetupEmail,
    updatePassword,
    getSession,
    requireSession,
    getUserEmail,
    signOut,
    onAuthStateChange,
    getAccessToken: async () => (await getSession())?.access_token ?? ""
  };
})();
