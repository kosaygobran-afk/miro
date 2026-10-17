// Local development only. Does not install dependencies or print the token.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
// Do not pass unrelated credentials loaded from Next.js env files to Python.
const inheritedEnv = { ...process.env };
nextEnv.loadEnvConfig(projectRoot, true, { info() {}, error() {} });

async function start() {
  const token = process.env.BACKGROUND_REMOVAL_WORKER_TOKEN;
  if (!token) {
    throw new Error("Set BACKGROUND_REMOVAL_WORKER_TOKEN in .env.local first.");
  }
  let url;
  try {
    url = new URL(process.env.BACKGROUND_REMOVAL_WORKER_URL || "");
  } catch {
    throw new Error(
      "Set BACKGROUND_REMOVAL_WORKER_URL to http://127.0.0.1:8000 in .env.local first.",
    );
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The local launcher requires a plain HTTP loopback URL.");
  }
  const host =
    url.hostname === "localhost"
      ? "127.0.0.1"
      : url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || 80);
  const python = process.env.BACKGROUND_REMOVAL_PYTHON
    ? resolve(process.env.BACKGROUND_REMOVAL_PYTHON)
    : [
        join(projectRoot, "python-worker", ".venv", "bin", "python"),
        join(projectRoot, "python-worker", ".venv", "Scripts", "python.exe"),
        join(tmpdir(), "miro-bg-worker", "bin", "python"),
        join(tmpdir(), "miro-image-review-venv", "bin", "python"),
        "/tmp/miro-bg-worker/bin/python",
        "/tmp/miro-image-review-venv/bin/python",
      ].find(existsSync);
  if (!python || !existsSync(python)) {
    throw new Error(
      "No worker Python environment found. Install python-worker/requirements.txt in a virtual environment, then set BACKGROUND_REMOVAL_PYTHON to its Python executable.",
    );
  }
  const env = {
    ...inheritedEnv,
    BACKGROUND_REMOVAL_WORKER_TOKEN: token,
    WORKER_HOST: host,
    WORKER_PORT: String(port),
  };
  for (const key of ["REMBG_HOME", "U2NET_HOME"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const dependencies = spawnSync(
    python,
    ["-c", "import fastapi, uvicorn, rembg, PIL, multipart"],
    { env, stdio: "ignore" },
  );
  if (dependencies.status !== 0) {
    throw new Error(
      "Worker dependencies are missing. Install python-worker/requirements.txt in the selected Python environment.",
    );
  }
  // Never stop or replace an existing listener, even if it looks like a worker.
  await new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once("error", () =>
      rejectPort(new Error(`Local port ${port} is already in use.`)),
    );
    probe.listen(port, host, () => probe.close(resolvePort));
  });
  console.log(
    `Starting private local ISNet worker on ${host}:${port}. Keep this terminal open.`,
  );
  console.log(
    "The first opaque image loads the fixed isnet-general-use model; an uncached model downloads its weights.",
  );
  const child = spawn(python, [join(projectRoot, "python-worker", "main.py")], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("error", () => {
    console.error("The background-removal worker could not start.");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1);
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
