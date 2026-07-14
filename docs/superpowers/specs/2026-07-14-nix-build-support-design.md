# Nix Build Support Design

**Status:** Approved for implementation on 2026-07-14  
**Target:** `x86_64-linux`, beginning with openSUSE Tumbleweed hosts that use Nix

## Goal

Add a local Flake that builds and runs MiniMax Agent without installing the
project's Debian package, running its maintainer scripts, or using root. The
result should be usable with:

```sh
nix build .#minimax-agent
nix run .
```

The application remains a third-party opaque binary. This work makes the
inputs and launch environment explicit; it does not make the application
source-buildable or independently trustworthy.

## Chosen Approach

The Flake treats two upstream archives as fixed inputs:

1. The repository's version-pinned `.deb` release, which supplies the MiniMax
   application resources and Linux-native modules.
2. Electron `v33.2.0` for Linux x64, which the existing project downloads at
   setup time but does not ship consistently in its package.

Each input is fetched by URL and SHA-256. The derivation extracts only the
data payload from the `.deb`; it never calls `dpkg -i`, `apt`, `setup.sh`, or
any `DEBIAN/*` maintainer script. It also never calls `npm install`, `npm
rebuild`, or a networked package manager while building.

The initial target is a Nix-enabled non-NixOS Linux host such as this
openSUSE workstation. Electron binaries and native modules are tied to the
Electron 33 ABI. NixOS support is contingent on the package passing the same
runtime checks there; it is not claimed in the first release without proof.

## Alternatives Considered

### Convert the `.deb` to RPM

This would keep Debian dependency names and maintainer hooks while adding an
extra conversion layer. It does not solve the root, sandbox, or provenance
problems, so it is out of scope.

### Use an FHS compatibility environment

An FHS wrapper could make the vendor Electron binary run with less packaging
work. It would leave more host-dependent behavior and make a portable Nix
interface harder to maintain. It is not the default design, though it may be
used later as a documented compatibility fallback if the native wrapper cannot
support a specific host.

### Unpack fixed archives into a Nix derivation

This is the selected approach. It makes the artifacts, versions, and hashes
visible in source control and avoids every privileged behavior in the original
installer.

## Repository Layout

```text
flake.nix                         Flake outputs and pinned nixpkgs input
flake.lock                        Locked Nix input revision
nix/minimax-agent.nix             Package derivation and fixed binary inputs
README.md                         Nix usage, limitations, and update procedure
docs/superpowers/specs/...        This approved design record
```

The package will be exposed as `packages.x86_64-linux.minimax-agent`, the
default package, and the default app. It will use a local `allowUnfree` policy
because neither the upstream project nor the bundled application presents a
redistributable source license suitable for nixpkgs.

## Build and Runtime Design

1. Fetch the exact release `.deb` and Electron archive with fixed hashes.
2. Extract the `.deb` data archive into a temporary build directory. Do not
   copy its `DEBIAN` metadata or execute its scripts.
3. Copy the application resources from that data tree into an Electron runtime
   tree under `$out/lib/minimax-agent`.
4. Patch or wrap native executables against declared Nix libraries. The
   wrapper sets only the library and application paths needed for the package.
5. Generate `$out/bin/minimax-agent` and a desktop entry that point at the
   Nix store path, not `/opt/minimax-agent` or `/usr/bin/minimax-agent`.
6. Keep all runtime state in the invoking user's XDG locations. Do not create
   a systemd service, enable linger, register global protocol handlers, or
   modify other users' home directories.

The launcher may retain the original GPU workaround if testing requires it,
but it must not pass `--no-sandbox`. Nix store files cannot safely host a
setuid `chrome-sandbox`; the launcher will use Electron's non-setuid sandbox
path instead. A sandbox failure is reported as a runtime compatibility issue,
not hidden by disabling Chromium sandboxing.

The optional `opencode` binary remains optional. The initial package will not
download or install it behind the user's back.

## Failure Handling

- A mismatched or unavailable archive hash stops evaluation or fetch.
- Missing `app.asar`, unpacked native modules, or the expected Electron binary
  stops the build with an actionable error.
- Native-module ABI failures are surfaced during a smoke check. The package
  must not attempt `npm rebuild` as a fallback.
- The README will state that Nix removes root installation behavior but does
  not sandbox the opaque app from the invoking user's files or network access.

## Verification

Implementation is complete only when all of these pass on this host:

1. `nix flake check` evaluates the Flake and its checks.
2. `nix build .#minimax-agent` completes without `sudo`, `apt`, `dpkg -i`, or
   npm network-install commands.
3. Static checks verify the generated launcher contains neither `--no-sandbox`
   nor paths under `/opt/minimax-agent` or `/usr/bin/minimax-agent`.
4. A non-interactive Electron smoke check verifies the packaged binary can
   initialize without attempting the original setup script.
5. `nix run .` is manually launched once in the active desktop session; any
   unresolved GUI or OAuth limitation is documented rather than masked.

## Non-goals

- Publishing the package to nixpkgs.
- Claiming MiniMax endorsement, a source build, or a security audit.
- RPM conversion or system-wide package installation.
- Automatic updates, automatic Node dependency rebuilds, or automatic
  installation of optional tools.

## Updating

An update changes the version and both fixed hashes in the derivation, then
reruns all verification steps. A new release is never adopted implicitly.
