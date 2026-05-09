import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

import { chromium } from "patchright";

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
  hint?: string;
}

export interface RunDoctorOptions {
  installChromium?: (events: InstallChromiumEvents) => Promise<InstallChromiumResult>;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

export interface InstallChromiumEvents {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface InstallChromiumResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const INSTALL_CHROMIUM_COMMAND = "npx patchright install chromium";
const INSTALL_CHROMIUM_HINT = `Run: ${INSTALL_CHROMIUM_COMMAND}`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chromiumExecutablePath(): string {
  const browserType = chromium as unknown as { executablePath: () => string };
  return browserType.executablePath();
}

function appendCheck(checks: DoctorCheck[], check: DoctorCheck): void {
  checks.push(check);
}

async function installPatchrightChromium(events: InstallChromiumEvents = {}): Promise<InstallChromiumResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["patchright", "install", "chromium"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => events.onStdout?.(chunk));
    child.stderr.on("data", (chunk: string) => events.onStderr?.(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
}

async function executableExists(path: string): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await access(path);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function ensureChromiumInstalled(
  checks: DoctorCheck[],
  executablePath: string,
  options: Required<RunDoctorOptions>,
): Promise<boolean> {
  const firstCheck = await executableExists(executablePath);
  if (firstCheck.ok) {
    appendCheck(checks, {
      name: "Patchright Chromium installation",
      ok: true,
      message: "Chromium executable exists.",
      detail: executablePath,
    });
    return true;
  }

  appendCheck(checks, {
    name: "Patchright Chromium installation",
    ok: false,
    message: "Chromium executable was not found on disk. Installing Patchright Chromium...",
    detail: `${executablePath}\n${errorMessage(firstCheck.error)}`,
  });

  let output = "";
  const appendOutput = (chunk: string): void => {
    output += chunk;
    options.stderr.write(chunk);
  };

  try {
    const result = await options.installChromium({ onStdout: appendOutput, onStderr: appendOutput });
    if (result.code !== 0) {
      appendCheck(checks, {
        name: "Patchright Chromium auto-install",
        ok: false,
        message: `Installation command failed with exit code ${result.code ?? "null"}${result.signal ? ` and signal ${result.signal}` : ""}.`,
        detail: output.trim() || undefined,
        hint: INSTALL_CHROMIUM_HINT,
      });
      return false;
    }
  } catch (error) {
    appendCheck(checks, {
      name: "Patchright Chromium auto-install",
      ok: false,
      message: "Installation command failed to start or crashed.",
      detail: errorMessage(error),
      hint: INSTALL_CHROMIUM_HINT,
    });
    return false;
  }

  const secondCheck = await executableExists(executablePath);
  appendCheck(checks, secondCheck.ok ? {
    name: "Patchright Chromium auto-install",
    ok: true,
    message: "Chromium installed successfully.",
    detail: executablePath,
  } : {
    name: "Patchright Chromium auto-install",
    ok: false,
    message: "Installation finished, but Chromium executable is still missing.",
    detail: `${executablePath}\n${errorMessage(secondCheck.error)}`,
    hint: INSTALL_CHROMIUM_HINT,
  });

  return secondCheck.ok;
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const resolvedOptions: Required<RunDoctorOptions> = {
    installChromium: options.installChromium ?? installPatchrightChromium,
    stderr: options.stderr ?? process.stderr,
  };
  let executablePath = "";

  try {
    executablePath = chromiumExecutablePath();
    checks.push({
      name: "Patchright Chromium executable path",
      ok: true,
      message: executablePath,
    });
  } catch (error) {
    checks.push({
      name: "Patchright Chromium executable path",
      ok: false,
      message: "Patchright does not report a Chromium executable for this platform.",
      detail: errorMessage(error),
      hint: INSTALL_CHROMIUM_HINT,
    });
  }

  const installed = executablePath ? await ensureChromiumInstalled(checks, executablePath, resolvedOptions) : false;

  if (installed) {
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      checks.push({
        name: "Patchright Chromium launch",
        ok: true,
        message: "Chromium launched successfully in headless mode.",
      });
    } catch (error) {
      checks.push({
        name: "Patchright Chromium launch",
        ok: false,
        message: "Chromium executable exists but failed to launch.",
        detail: errorMessage(error),
        hint: INSTALL_CHROMIUM_HINT,
      });
    }
  }

  return {
    ok: checks.at(-1)?.ok === true,
    checks,
  };
}

export function formatDoctorResult(result: DoctorResult): string {
  const lines = ["Feedloom doctor"];
  for (const check of result.checks) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.name}: ${check.message}`);
    if (check.detail) {
      lines.push(...check.detail.split("\n").map((line) => `  ${line}`));
    }
    if (check.hint) {
      lines.push(`  ${check.hint}`);
    }
  }
  lines.push(result.ok ? "OK" : "FAILED");
  return lines.join("\n");
}
