// Local Supabase protocol double. Never sends email or touches real accounts.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const messages = [];
const sessions = new Map();
const passwords = new Map();
const user = (email) => ({
  id: "00000000-0000-4000-8000-000000000001",
  email,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
});
function session(email) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user(email).id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const access_token = `eyJhbGciOiJIUzI1NiJ9.${payload}.${randomUUID()}`;
  sessions.set(access_token, email);
  return {
    access_token,
    refresh_token: randomUUID(),
    token_type: "bearer",
    expires_in: 3600,
    user: user(email),
  };
}

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  const send = (body, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send({});
  const url = new URL(req.url, "http://127.0.0.1:54331");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const email = sessions.get(req.headers.authorization?.replace("Bearer ", ""));
  const invalid = () =>
    send({ code: "otp_expired", msg: "Invalid or expired link" }, 400);

  if (url.pathname === "/health") return send({ ok: true });
  if (url.pathname === "/test/messages")
    return send(
      messages.filter((m) => m.email === url.searchParams.get("email")),
    );
  if (url.pathname === "/test/session") return send(session(body.email));
  if (url.pathname === "/auth/v1/recover") {
    messages.push({
      ...body,
      redirect: url.searchParams.get("redirect_to"),
      code: randomUUID(),
    });
    return send({});
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "password") {
      return passwords.get(body.email) === body.password
        ? send(session(body.email))
        : invalid();
    }
    const message = messages.find((m) => m.code === body.auth_code && !m.used);
    if (!message) return invalid();
    const challenge = createHash("sha256")
      .update(body.code_verifier ?? "")
      .digest("base64url");
    if (challenge !== message.code_challenge) return invalid();
    message.used = true;
    return send(session(message.email));
  }
  if (url.pathname === "/auth/v1/verify") {
    if (body.type !== "recovery" || body.token_hash !== "valid-test-hash")
      return invalid();
    return send(session("token-hash@example.test"));
  }
  if (url.pathname === "/auth/v1/user") {
    if (!email) return send({ msg: "Not authenticated" }, 401);
    if (req.method === "PUT") passwords.set(email, body.password);
    return send(user(email));
  }
  if (url.pathname === "/auth/v1/logout") {
    sessions.delete(req.headers.authorization?.replace("Bearer ", ""));
    return send({});
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    return send(req.headers.accept?.includes("vnd.pgrst.object") ? null : []);
  }
  send({ error: "Unexpected test request" }, 404);
}).listen(54331, "127.0.0.1");
