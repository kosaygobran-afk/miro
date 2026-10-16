# NVIDIA Nemotron Ultra in Kimi Code and OpenCode

Updated 2026-10-16. This is local developer tooling, independent of the website's commerce implementation and release approvals.

## Model and maximum settings

Both native CLIs default to `nvidia/nemotron-ultra`, mapped to the real NVIDIA API model `nvidia/nemotron-3-ultra-550b-a55b`. Kimi Code 2.1.1 and OpenCode 2.0.24 were inspected and exercised with synthetic file-reading tools. OpenCode's primary agent remains `build`; both tools retain GPT-OSS 20B for configured workers.

Full supported reasoning is `high`, with `reasoning_budget = -1`, enabled thinking, `medium_effort = false`, and `force_nonempty_content = true`. Sampling uses NVIDIA's temperature 1 / top-p 0.95. Output is capped at the documented 32,768 tokens, respecting a smaller caller cap near context exhaustion. The catalog's 1,000,000-token context declaration is configured; full-window and maximum-length generation have not been load-tested.

Direct live requests also accepted 65,536 and 65,537 token ceilings, despite the current reference documenting 32,768. A short answer with an accepted ceiling does not establish that generating that many tokens works. Keep the documented ceiling until NVIDIA confirms a higher supported limit. A 1,048,576-token ceiling probe returned HTTP 503 and did not establish a limit.

Sources: [NVIDIA hosted API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer), [NVIDIA model card](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard), [Kimi configuration](https://moonshotai.github.io/kimi-code/en/configuration/config-files.html), [OpenCode v2 providers](https://opencode.ai/v2/docs/providers).

## Why the native endpoint uses a local bridge

The actual Kimi executable sends `prompt_cache_key` to NVIDIA and fails with HTTP 400 on Ultra. Kimi's OpenAI provider also ignores `max_output_size`; an alias listing does not verify the wire settings. The old wrapper could substitute GPT-OSS, buffer the entire terminal session, change the working directory and mask failure exit codes. It did not make Ultra work.

`scripts/nvidia-cli-bridge.mjs` is copied to `~/.local/share/kimi-nvidia-compat/bridge.mjs`. The user LaunchAgent `com.miro.nvidia-cli-bridge` runs it on `127.0.0.1:19119`, automatically at login and after an unexpected exit. Both native NVIDIA providers point to `http://127.0.0.1:19119/v1`. The installed executables are preserved. `kimi-safe` now executes the actual binary directly and preserves its terminal, working directory and exit status; the obsolete shell `KIMI_MODEL` override was removed.

The bridge strips unsupported OpenAI cache fields and applies the Ultra request settings before the first request. It permits only NVIDIA model listing and chat completion routes, requires a bearer credential and always forwards to the fixed NVIDIA HTTPS origin. Existing credentials stay in their existing protected config/environment locations; none are stored in the bridge, LaunchAgent or repository.

Ultra's hosted stream can expose raw thinking text followed by `</think>` in ordinary content. The bridge buffers until the delimiter is confirmed and separates it into `reasoning_content` and final content for the CLIs. Already separated streams and responses without a delimiter retain their content. Tool deltas, upstream errors and finish reasons remain intact. Long raw reasoning therefore appears when its closing delimiter arrives. No alternative model or fabricated success is introduced. Version 2 permits only the bounded, explicit transient-HTTP retries described below; partial streams and unknown network outcomes are never replayed.

## Operating commands

New native sessions use Ultra automatically. Explicit selectors:

```sh
kimi -m nvidia/nemotron-ultra
opencode run --standalone -m nvidia/nemotron-ultra#max "Your prompt"
```

Basic checks:

```sh
kimi doctor
curl --fail --max-time 5 http://127.0.0.1:19119/health
node --test tests/unit/nvidia-cli-bridge.test.mjs
opencode reload
```

After changing the bridge, test it before copying and restarting:

```sh
cp scripts/nvidia-cli-bridge.mjs ~/.local/share/kimi-nvidia-compat/bridge.mjs
launchctl kickstart -k "gui/$(id -u)/com.miro.nvidia-cli-bridge"
```

The LaunchAgent pins the installed Node executable path. Engineering must update its `ProgramArguments` if that Node version is removed, then reload the service. Another machine needs the bridge and its own local service before using this repository's NVIDIA provider configuration. Existing CLI sessions can retain their previous selected model; reopen or select Ultra explicitly. Do not terminate active sessions with unsaved work.

Protected operational logs live in `~/.local/state/kimi-nvidia-compat/`. They contain model/settings/status metadata only. Runtime/config backups are in `~/.local/state/miro-runtime-backups/` with private permissions. Restore the appropriate backup configuration and shell launcher before unloading the bridge; otherwise native providers would still point at a stopped local endpoint. Do not copy credential-bearing backups into Git or print config/credential values when troubleshooting.

## Verification and scope

Real probes use random fixture contents that are absent from the prompt, require an actual successful read-tool result, and compare the final response with those exact contents. An initial OpenCode probe used the wrong working-directory assumption; the final probe uses an absolute fixture path. Tests cover normalization, streaming, cancellation, error propagation, retry guidance, invalid requests and secret-free logs. Detailed dated results are recorded in `docs/PROJECT_STATUS.md`.

Privacy/security owner: approve any future use of real business/customer material with the already configured NVIDIA service. Engineering owner: repeat native tool-flow verification after CLI/provider upgrades. No website accessibility behavior changed. Existing business/accountant/provider/privacy and manual accessibility launch actions remain open.

## Version 2 retry reconstruction — 2026-10-16

The October 15 Windows handoff mentioned retry code and a starter that had not
been committed. `scripts/nvidia-cli-bridge.mjs` now supplies up to 20 upstream
attempts for 429/502/503/504 only, before forwarding any response bytes. Each
attempt uses the same normalized body/model. Retry-After seconds or HTTP dates
are honored, otherwise exponential backoff is capped at 30 seconds plus jitter.
The existing one-hour request deadline and disconnect cancellation also cover
cooldowns. Permanent statuses (including retirement/auth/validation failures),
network exceptions with unknown outcomes, and any started stream are not replayed.
Health reports `version: 2` and `maxAttempts: 20`. Operational logs add only attempt
metadata; no prompts, responses or credentials.

Kimi's own per-step budget must not multiply the bridge budget. Supported private
configuration, retaining the current model and provider credentials:

```toml
[loop_control]
max_attempts_per_step = 20

[providers.nvidia.custom_headers]
"X-Miro-Retry-Owner" = "client"
```

The [Kimi configuration reference](https://moonshotai.github.io/kimi-code/en/configuration/config-files.html)
documents both settings. The bridge honors that header by making one attempt;
other clients use its bounded budget. Twenty attempts applies to one upstream
request, not a whole CLI session. `opencode.json` model/agent routing is unchanged.

On Windows, `scripts/start-nvidia-cli-bridge.ps1 -InstallStartup` copies source to
a user-private LOCALAPPDATA directory, protects its ACL, starts the fixed loopback
service with private operational logs, and optionally creates a per-user Startup
VBS. It refuses to terminate an existing older/different service; save active CLI
work and stop that process deliberately before upgrading. Login persistence is
not crash supervision. No credential is placed in the script, VBS or repository.
PowerShell/Startup installation cannot be executed on this macOS review host and
remains a Windows engineering action; do not claim that machine was repaired by
this source reconstruction.

The earlier K3 retirement/K2.6 access entries are historical observations from the
other machine. This reconstruction preserves Ultra identity and does not add any
fallback alias or claim that an inaccessible model is usable. Current regression
and synthetic CLI probe results are tracked in PROJECT_STATUS and the reconciliation
checklist; never infer live availability from the provider catalog alone.
