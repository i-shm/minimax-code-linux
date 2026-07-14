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
  fetchzip,
  glib,
  gtk3,
  lib,
  libdrm,
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
  stdenvNoCC,
  udev,
}:

let
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

  # Electron's published archive SHA-256 is
  # fc9e2a5f969d0fcf7546eb3299a2450329ba4f05c1baa4f0ed7b269b45e2232b.
  # fetchzip pins the extracted NAR, so its hash differs from the archive hash.
  electron = fetchzip {
    url = "https://github.com/electron/electron/releases/download/v33.2.0/electron-v33.2.0-linux-x64.zip";
    hash = "sha256-YRsaRtG2SXaJcMlJbjW4PSsmTK8Jk324hGc2whlE4UE=";
    stripRoot = false;
  };

  dontUnpack = true;

  nativeBuildInputs = [
    autoPatchelfHook
    copyDesktopItems
    dpkg
    makeWrapper
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
    test -x "$electron/electron"

    appDir="$out/lib/${finalAttrs.pname}"
    cp -a "$electron"/. "$appDir"/
    chmod -R u+w "$appDir"
    rm -rf "$appDir/resources"
    mkdir -p "$appDir/resources"
    cp -a deb/opt/minimax-agent/resources/. "$appDir/resources/"

    if [ -d deb/usr/share/icons ]; then
      cp -a deb/usr/share/icons "$out/share/"
    fi

    if [ -e "$appDir/chrome-sandbox" ]; then
      chmod a-s "$appDir/chrome-sandbox"
      test ! -u "$appDir/chrome-sandbox"
      test ! -g "$appDir/chrome-sandbox"
    fi

    makeWrapper "$appDir/electron" "$out/bin/minimax-agent" \
      --prefix LD_LIBRARY_PATH : "$appDir:${lib.makeLibraryPath runtimeLibraries}" \
      --add-flags "--disable-gpu --disable-setuid-sandbox"

    runHook postInstall
  '';

  meta = {
    description = "Unofficial user-scoped Nix package for MiniMax Agent";
    homepage = "https://github.com/unn-Known1/minimax-agent-linux";
    license = lib.licenses.unfreeRedistributable;
    mainProgram = "minimax-agent";
    platforms = [ "x86_64-linux" ];
  };
})
