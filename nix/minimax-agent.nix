{
  alsa-lib,
  at-spi2-atk,
  at-spi2-core,
  autoPatchelfHook,
  cairo,
  copyDesktopItems,
  cups,
  dbus,
  dpkg,
  expat,
  fetchurl,
  glib,
  gtk3,
  lib,
  libdrm,
  libgbm,
  libnotify,
  libx11,
  libxcomposite,
  libxdamage,
  libxext,
  libxfixes,
  libxkbcommon,
  libxrandr,
  libxrender,
  libxscrnsaver,
  libxtst,
  libxcb,
  makeDesktopItem,
  makeWrapper,
  mesa,
  nspr,
  nss,
  pango,
  patchelf,
  runtimeShell,
  stdenv,
  stdenvNoCC,
  udev,
  unzip,
  xdg-utils,
}:

let
  electronVersion = "33.4.11";

  runtimeLibraries = [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    cairo
    cups
    dbus
    expat
    glib
    gtk3
    libdrm
    libgbm
    libnotify
    libxkbcommon
    mesa
    nspr
    nss
    pango
    udev
    libx11
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libxrender
    libxscrnsaver
    libxtst
    libxcb
  ];
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "minimax-agent";
  version = "3.0.46";

  src = fetchurl {
    name = "minimax-agent-${finalAttrs.version}-amd64.deb";
    url = "https://github.com/unn-Known1/minimax-agent-linux/releases/download/v${finalAttrs.version}/minimax-agent_${finalAttrs.version}_amd64.deb";
    hash = "sha256-c++oDD6iekD+YdLMa+p/oSvBoJw+DYMK4i8G4fDMddQ=";
  };

  # The SHA-256 is from Electron's official v33.4.11 SHASUMS256.txt.
  electron = fetchurl {
    url = "https://github.com/electron/electron/releases/download/v${electronVersion}/electron-v${electronVersion}-linux-x64.zip";
    hash = "sha256-IS1DHHyRYpIxHHl82R+ERnxavW5pg88ksWLv/2TO6Kk=";
  };

  dontUnpack = true;

  nativeBuildInputs = [
    autoPatchelfHook
    copyDesktopItems
    dpkg
    makeWrapper
    patchelf
    unzip
  ];

  buildInputs = runtimeLibraries;

  desktopItems = [
    (makeDesktopItem {
      name = "minimax-agent";
      desktopName = "MiniMax Agent";
      comment = "Unofficial Linux port of MiniMax Agent";
      exec = "minimax-agent %U";
      icon = "minimax-agent";
      categories = [ "Network" "Chat" ];
      mimeTypes = [
        "x-scheme-handler/minimax"
        "x-scheme-handler/minimax-cn"
        "x-scheme-handler/minimax-agent"
      ];
    })
  ];

  installPhase = ''
    runHook preInstall

    mkdir -p deb "$out/lib/${finalAttrs.pname}" "$out/share"
    dpkg-deb -x "$src" deb

    test -f deb/opt/minimax-agent/resources/app.asar
    test -d deb/opt/minimax-agent/resources/app.asar.unpacked
    mkdir electron-runtime
    unzip -q "$electron" -d electron-runtime

    test -x electron-runtime/electron

    appDir="$out/lib/${finalAttrs.pname}"
    cp -a electron-runtime/. "$appDir"/
    chmod -R u+w "$appDir"
    rm -rf "$appDir/resources"
    mkdir -p "$appDir/resources"
    cp -a deb/opt/minimax-agent/resources/. "$appDir/resources/"

    # The upstream Debian archive ships the international production settings
    # in app.asar. The app loader gives this file precedence over the launcher
    # environment, so rewrite that packed entry at build time. The rewriter
    # keeps all other archive bytes and the existing native-module layout.
    appAsar="$appDir/resources/app.asar"
    patchelf --set-interpreter ${stdenv.cc.bintools.dynamicLinker} "$appDir/electron"
    LD_LIBRARY_PATH="$appDir:${lib.makeLibraryPath runtimeLibraries}" \
      ELECTRON_RUN_AS_NODE=1 \
      "$appDir/electron" ${./rewrite-asar-env.js} "$appAsar" ${./minimax-agent.env.local}
    test -f "$appAsar"
    test -d "$appAsar.unpacked"

    if [ -d deb/usr/share/icons ]; then
      cp -a deb/usr/share/icons "$out/share/"
    fi

    if [ -e "$appDir/chrome-sandbox" ]; then
      chmod a-s "$appDir/chrome-sandbox"
      test ! -u "$appDir/chrome-sandbox"
      test ! -g "$appDir/chrome-sandbox"
    fi

    browserOpenerDir="$out/libexec/${finalAttrs.pname}"
    mkdir -p "$browserOpenerDir"
    cat > "$browserOpenerDir/xdg-open" <<'EOF'
#!${runtimeShell}
unset LD_LIBRARY_PATH
unset LD_PRELOAD
exec ${xdg-utils}/bin/xdg-open "$@"
EOF
    chmod +x "$browserOpenerDir/xdg-open"

    makeWrapper "$appDir/electron" "$out/bin/minimax-agent" \
      --prefix LD_LIBRARY_PATH : "$appDir:${lib.makeLibraryPath runtimeLibraries}" \
      --prefix PATH : "$browserOpenerDir" \
      --add-flags "--disable-gpu --disable-setuid-sandbox"

    runHook postInstall

    desktopFile="$out/share/applications/minimax-agent.desktop"
    test -f "$desktopFile"
    substituteInPlace "$desktopFile" \
      --replace-fail 'Exec=minimax-agent %U' "Exec=$out/bin/minimax-agent %U"
  '';

  meta = {
    description = "Unofficial user-scoped Nix package for MiniMax Agent";
    homepage = "https://github.com/unn-Known1/minimax-agent-linux";
    license = lib.licenses.unfreeRedistributable;
    mainProgram = "minimax-agent";
    platforms = [ "x86_64-linux" ];
  };
})
