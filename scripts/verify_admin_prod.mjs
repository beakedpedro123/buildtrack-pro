const BASE_URL = process.env.ADMIN_TEST_BASE_URL || "https://buildtrack-dnjxcthz.manus.space";

const admins = [
  { keyId: "pedro", label: "Pedro Carranza", key: process.env.ADMIN_TEST_KEY_PEDRO },
  { keyId: "pablo", label: "Pablo Carranza", key: process.env.ADMIN_TEST_KEY_PABLO },
  { keyId: "lupe", label: "Lupe Mejia", key: process.env.ADMIN_TEST_KEY_LUPE },
];

function redactToken(value) {
  if (!value || typeof value !== "string") return "missing";
  return `${value.slice(0, 8)}…${value.slice(-6)} (${value.length} chars)`;
}

function bodySummary(body) {
  if (!body || typeof body !== "object") return body;
  const clone = JSON.parse(JSON.stringify(body));
  if (clone.token) clone.token = redactToken(clone.token);
  if (clone.sessionToken) clone.sessionToken = redactToken(clone.sessionToken);
  if (clone.adminKey) clone.adminKey = "[redacted]";
  return clone;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await readJson(response);
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type") || "",
    allowHeaders: response.headers.get("access-control-allow-headers") || "",
    body,
  };
}

const results = [];

for (const admin of admins) {
  if (!admin.key) {
    results.push({ keyId: admin.keyId, label: admin.label, step: "precheck", ok: false, status: "missing_key_env" });
    continue;
  }

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key-id": admin.keyId,
    },
    body: JSON.stringify({ adminKey: admin.key, key: admin.key }),
  });
  const token = login.body?.token || login.body?.sessionToken || null;
  results.push({
    keyId: admin.keyId,
    label: admin.label,
    step: "login",
    ok: login.ok && Boolean(token),
    status: login.status,
    allowHeadersIncludeKeyId: login.allowHeaders.toLowerCase().includes("x-admin-key-id"),
    body: bodySummary(login.body),
  });

  if (!token) continue;

  const verify = await request("/api/admin/verify", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-admin-key-id": admin.keyId,
    },
  });
  results.push({
    keyId: admin.keyId,
    label: admin.label,
    step: "verify",
    ok: verify.ok && (verify.body?.valid === true || verify.body?.authenticated === true || Boolean(verify.body?.admin)),
    status: verify.status,
    allowHeadersIncludeKeyId: verify.allowHeaders.toLowerCase().includes("x-admin-key-id"),
    body: bodySummary(verify.body),
  });
}

const invalid = await request("/api/admin/login", {
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-key-id": "pedro" },
  body: JSON.stringify({ adminKey: "not-the-real-admin-key" }),
});
results.push({
  keyId: "pedro",
  label: "Invalid-key control",
  step: "invalid_login_control",
  ok: invalid.status === 401 || invalid.status === 403,
  status: invalid.status,
  body: bodySummary(invalid.body),
});

console.log(JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results }, null, 2));

const failed = results.filter((r) => !r.ok);
process.exitCode = failed.length ? 1 : 0;
