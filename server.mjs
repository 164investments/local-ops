import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const PORT = 3099;
const NODE = process.execPath;

// ─── Supabase ──────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─── Script Registry ───────────────────────────────────────────────

const SCRIPTS = [
  {
    id: "booking-pay",
    name: "Booking.com Invoices",
    description: "Pay outstanding Booking.com commission invoices with saved credit card",
    dir: join(homedir(), "scripts", "booking-pay"),
    command: NODE,
    file: "pay-invoices.mjs",
    flags: [
      { id: "dry-run", label: "Dry Run", arg: "--dry-run", default: true },
      { id: "login", label: "Force Login", arg: "--login", default: false },
    ],
  },
  {
    id: "clackamas-tax",
    name: "Clackamas Tax Filing",
    description: "File monthly transient lodging tax for Mt Hood properties",
    dir: join(homedir(), "scripts", "clackamas-tax"),
    command: NODE,
    file: "file-tax.mjs",
    flags: [
      { id: "dry-run", label: "Dry Run", arg: "--dry-run", default: true },
    ],
    inputs: [
      { id: "month", label: "Month (YYYY-MM)", arg: "--month", placeholder: "2026-02", required: false },
    ],
  },
  {
    id: "munirevs-tax",
    name: "MuniRevs STR User Fee",
    description: "File Clackamas County STR User Fee (.85%) via MuniRevs — processes all open tasks",
    dir: join(homedir(), "scripts", "munirevs-tax"),
    command: NODE,
    file: "file-str-fee.mjs",
    flags: [
      { id: "dry-run", label: "Dry Run", arg: "--dry-run", default: true },
      { id: "login", label: "Force Login", arg: "--login", default: false },
    ],
  },
  {
    id: "tsheets-check",
    name: "TSheets Clock-Out Checker",
    description: "Check that cleaning employees clocked out at the warehouse hub (1011 SE Oak St) using GPS data",
    dir: join(homedir(), "scripts", "tsheets-check"),
    command: NODE,
    file: "check-clockout.mjs",
    flags: [
      { id: "login", label: "Force Login", arg: "--login", default: false },
    ],
    inputs: [
      { id: "date", label: "Date (YYYY-MM-DD)", arg: "--date", placeholder: "2026-03-30", required: false },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────

const readBody = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });

const json = (res, data, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

// ─── Server ────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET / — serve UI
  if (req.method === "GET" && url.pathname === "/") {
    const html = readFileSync(join(__dirname, "index.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  // GET /api/scripts
  if (req.method === "GET" && url.pathname === "/api/scripts") {
    json(res, SCRIPTS.map(({ id, name, description, flags, inputs }) => ({
      id, name, description, flags, inputs,
    })));
    return;
  }

  // ─── Tax Properties CRUD ───────────────────────────────────────

  if (url.pathname === "/api/tax/properties") {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("tax_properties").select("*").order("id");
      if (error) return json(res, { error: error.message }, 500);
      return json(res, data);
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const { data, error } = await supabase
        .from("tax_properties").insert(body).select().single();
      if (error) return json(res, { error: error.message }, 500);
      return json(res, data, 201);
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      const { id, ...updates } = body;
      const { data, error } = await supabase
        .from("tax_properties").update(updates).eq("id", id).select().single();
      if (error) return json(res, { error: error.message }, 500);
      return json(res, data);
    }
    if (req.method === "DELETE") {
      const body = await readBody(req);
      const { error } = await supabase
        .from("tax_properties").delete().eq("id", body.id);
      if (error) return json(res, { error: error.message }, 500);
      return json(res, { ok: true });
    }
  }

  // GET /api/tax/listing-names
  if (req.method === "GET" && url.pathname === "/api/tax/listing-names") {
    const all = url.searchParams.get("all");
    const idsParam = url.searchParams.get("ids");

    if (all === "true") {
      const { data, error } = await supabase
        .from("listings").select("id, nickname")
        .eq("active", true).order("nickname");
      if (error) return json(res, { error: error.message }, 500);
      return json(res, data ?? []);
    }
    if (idsParam) {
      const ids = idsParam.split(",").map(Number).filter(Boolean);
      if (ids.length === 0) return json(res, []);
      const { data, error } = await supabase
        .from("listings").select("id, nickname").in("id", ids);
      if (error) return json(res, { error: error.message }, 500);
      return json(res, data ?? []);
    }
    return json(res, []);
  }

  // ─── Run Script (SSE) ─────────────────────────────────────────

  const runMatch = url.pathname.match(/^\/api\/run\/([a-z0-9-]+)$/);
  if (req.method === "POST" && runMatch) {
    const scriptId = runMatch[1];
    const script = SCRIPTS.find((s) => s.id === scriptId);
    if (!script) return json(res, { error: "Script not found" }, 404);

    const scriptPath = resolve(script.dir, script.file);
    if (!existsSync(scriptPath)) return json(res, { error: `Script not found: ${scriptPath}` }, 404);

    const body = await readBody(req);
    const { flags = {}, inputs = {} } = body;

    const args = [scriptPath];
    for (const flag of script.flags ?? []) {
      if (flags[flag.id]) args.push(flag.arg);
    }
    for (const input of script.inputs ?? []) {
      const value = inputs[input.id];
      if (value) args.push(input.arg, value);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const child = spawn(script.command, args, {
      cwd: script.dir,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let ended = false;
    const send = (type, data) => {
      if (ended) return;
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    child.stdout.on("data", (chunk) => send("stdout", chunk.toString()));
    child.stderr.on("data", (chunk) => send("stderr", chunk.toString()));

    child.on("close", (code, signal) => {
      send("exit", { code: code ?? (signal ? `signal:${signal}` : null) });
      ended = true;
      res.end();
    });

    child.on("error", (err) => {
      send("error", err.message);
      ended = true;
      res.end();
    });

    req.on("close", () => { ended = true; });
    return;
  }

  // 404
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Local Ops running at http://localhost:${PORT}`);
});
