#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createJsonlLogger } from "../utilities/pipeline_logger.mjs";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function color(text, code) {
  return `${code}${text}${C.reset}`;
}

function ok(text) {
  return color(text, C.green);
}

function warn(text) {
  return color(text, C.yellow);
}

function fail(text) {
  return color(text, C.red);
}

function info(text) {
  return color(text, C.cyan);
}

function dim(text) {
  return color(text, C.dim);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch {
      // Retry until timeout.
    }
    await sleep(500);
  }
  return false;
}

function printModuleSummary(modules) {
  console.log(`${C.bold}Module Summary${C.reset}`);
  console.log(dim("------------------------------------------------------------"));
  for (const mod of modules) {
    const enabled = mod.enabled !== false ? ok("enabled") : fail("disabled");
    console.log(`${info(mod.id)} ${dim(`(${mod.cwd ?? "."})`)} ${enabled}`);
    if (mod.info) console.log(`  ${dim(mod.info)}`);
    const endpoints = Array.isArray(mod.endpoints) ? mod.endpoints : [];
    for (const ep of endpoints) {
      console.log(`  ${dim("endpoint:")} ${color(ep, C.gray)}`);
    }
    console.log("");
  }
  console.log(dim("------------------------------------------------------------"));
}

function makeSpinner() {
  const frames = ["|", "/", "-", "\\"];
  let timer = null;
  let idx = 0;
  let text = "pipeline running";

  const clearLine = () => {
    process.stdout.write("\r" + " ".repeat(120) + "\r");
  };

  const start = (label) => {
    if (label) text = label;
    if (timer) return;
    timer = setInterval(() => {
      const frame = frames[idx % frames.length];
      idx += 1;
      process.stdout.write(`\r${dim(`[${frame}] ${text}`)}`);
    }, 140);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      clearLine();
    }
  };

  const printLine = (line) => {
    const wasRunning = !!timer;
    if (wasRunning) stop();
    process.stdout.write(`${line}\n`);
    if (wasRunning) start();
  };

  return { start, stop, printLine };
}

function attachOutput(stream, label, logger, spinner) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const lower = line.toLowerCase();
      if (lower.includes("error") || lower.includes("failed") || lower.includes("exception")) {
        spinner.printLine(`${fail("[ERROR]")} ${info(`[${label}]`)} ${line}`);
        logger.log("module_error_output", { module: label, line });
      }
    }
  });
}

async function main() {
  const root = process.cwd();
  const configPath = path.join(root, "pipeline.config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const modules = (config.modules ?? []).filter((m) => m.enabled !== false);
  if (modules.length === 0) {
    console.log(warn("No enabled modules in config."));
    return;
  }

  const logPath = path.resolve(root, config.log_file || "../logs/pipeline.jsonl");
  const logger = createJsonlLogger(logPath);
  const spinner = makeSpinner();

  logger.log("launcher_start", { pipeline: config.name ?? "unnamed", config_path: configPath, log_path: logPath });

  printModuleSummary(modules);

  const children = [];
  const shutdown = (reason) => {
    spinner.stop();
    if (reason) console.log(warn(`Shutting down pipeline (${reason})...`));
    logger.log("launcher_shutdown", { reason: reason ?? "unknown" });
    for (const child of children) {
      if (!child.killed) child.kill("SIGINT");
    }
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
    process.exit(0);
  });

  console.log(`${C.bold}Pipeline${C.reset} ${info(config.name ?? "unnamed")} ${dim("starting...")}`);
  console.log(dim(`log file: ${logPath}`));
  console.log("");

  for (const mod of modules) {
    const cwd = path.resolve(root, mod.cwd || ".");
    const cmd = mod.command;
    const args = mod.args || [];
    if (!cmd) throw new Error(`Module ${mod.id} missing command`);

    console.log(`${warn("Starting")} ${info(mod.id)} ${dim(`(${cwd})`)}`);
    logger.log("module_starting", { module: mod.id, cwd, command: cmd, args });

    const isWindows = process.platform === "win32";
    const isCmdLike = typeof cmd === "string" && /\.(cmd|bat)$/i.test(cmd);
    const spawnCommand = isWindows && isCmdLike ? "cmd.exe" : cmd;
    const spawnArgs = isWindows && isCmdLike ? ["/d", "/s", "/c", cmd, ...args] : args;

    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: { ...process.env, ...(mod.env || {}) },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    attachOutput(child.stdout, mod.id, logger, spinner);
    attachOutput(child.stderr, `${mod.id}:err`, logger, spinner);

    child.on("exit", (code, signal) => {
      const status = code === 0 ? warn("stopped") : fail("error");
      spinner.printLine(`${info(mod.id)} ${status} ${dim(`(code=${code}, signal=${signal ?? "none"})`)}`);
      logger.log("module_exit", { module: mod.id, code, signal: signal ?? null });
    });

    children.push(child);

    if (mod.wait_for_http) {
      const timeoutMs = Number(mod.wait_timeout_ms || 15000);
      const ready = await waitForHttp(mod.wait_for_http, timeoutMs);
      if (!ready) {
        logger.log("module_health_timeout", { module: mod.id, wait_for_http: mod.wait_for_http, timeout_ms: timeoutMs });
        throw new Error(`Module ${mod.id} did not become ready at ${mod.wait_for_http} within ${timeoutMs}ms`);
      }
      console.log(`  ${info(mod.id)} ${ok("running")} ${dim(`(health: ${mod.wait_for_http})`)}`);
      logger.log("module_running", { module: mod.id, health_url: mod.wait_for_http });
    } else {
      console.log(`  ${info(mod.id)} ${ok("running")}`);
      logger.log("module_running", { module: mod.id });
    }

    const delay = Number(mod.start_delay_ms || 0);
    if (delay > 0) await sleep(delay);
    console.log("");
  }

  console.log(`${ok("Pipeline started.")} ${dim("Press Ctrl+C to stop.")}`);
  spinner.start("pipeline running");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`${fail("FATAL")} ${msg}`);
  process.exit(1);
});
