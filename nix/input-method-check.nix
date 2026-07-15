{
  coreutils,
  gnugrep,
  gnused,
  minimax-agent,
  runCommand,
  runtimeShell,
}:

runCommand "minimax-agent-input-method" {
  nativeBuildInputs = [ coreutils gnugrep gnused ];
} ''
  launcher=${minimax-agent}/libexec/minimax-agent/launcher

  test -x "$launcher"
  grep -F -- 'fcitx5-remote' "$launcher"
  grep -F -- 'GTK_IM_MODULE="''${GTK_IM_MODULE:-fcitx}"' "$launcher"
  grep -F -- 'QT_IM_MODULE="''${QT_IM_MODULE:-fcitx}"' "$launcher"
  grep -F -- 'XMODIFIERS="''${XMODIFIERS:-@im=fcitx}"' "$launcher"
  grep -F -- 'WAYLAND_DISPLAY' "$launcher"
  grep -F -- '--ozone-platform=wayland' "$launcher"
  grep -F -- '--enable-wayland-ime' "$launcher"
  grep -F -- '--wayland-text-input-version=3' "$launcher"

  testDir=$(${coreutils}/bin/mktemp -d)
  testLauncher="$testDir/launcher"
  fakeElectron="$testDir/electron"

  ${gnused}/bin/sed \
    "s|^electron=.*$|electron='$fakeElectron'|" \
    "$launcher" > "$testLauncher"
  chmod +x "$testLauncher"

  cat > "$testDir/fcitx5-remote" <<'EOF'
#!${runtimeShell}
exit 0
EOF
  chmod +x "$testDir/fcitx5-remote"

  cat > "$fakeElectron" <<'EOF'
#!${runtimeShell}
{
  printf 'GTK_IM_MODULE=%s\n' "$GTK_IM_MODULE"
  printf 'QT_IM_MODULE=%s\n' "$QT_IM_MODULE"
  printf 'XMODIFIERS=%s\n' "$XMODIFIERS"
  printf 'arguments=%s\n' "$*"
} > "$MINIMAX_AGENT_TEST_RESULT"
EOF
  chmod +x "$fakeElectron"

  waylandResult="$testDir/wayland-result"
  ${coreutils}/bin/env -i \
    PATH="$testDir" \
    WAYLAND_DISPLAY=wayland-0 \
    MINIMAX_AGENT_TEST_RESULT="$waylandResult" \
    "$testLauncher" --sample-argument
  grep -qx 'GTK_IM_MODULE=fcitx' "$waylandResult"
  grep -qx 'QT_IM_MODULE=fcitx' "$waylandResult"
  grep -qx 'XMODIFIERS=@im=fcitx' "$waylandResult"
  grep -qx 'arguments=--disable-gpu --disable-setuid-sandbox --ozone-platform=wayland --enable-wayland-ime --wayland-text-input-version=3 --sample-argument' "$waylandResult"

  x11Result="$testDir/x11-result"
  ${coreutils}/bin/env -i \
    PATH="$testDir" \
    MINIMAX_AGENT_TEST_RESULT="$x11Result" \
    "$testLauncher" --sample-argument
  grep -qx 'arguments=--disable-gpu --disable-setuid-sandbox --sample-argument' "$x11Result"

  overrideResult="$testDir/override-result"
  ${coreutils}/bin/env -i \
    PATH="$testDir" \
    GTK_IM_MODULE=ibus \
    QT_IM_MODULE=ibus \
    XMODIFIERS=@im=ibus \
    MINIMAX_AGENT_TEST_RESULT="$overrideResult" \
    "$testLauncher" --sample-argument
  grep -qx 'GTK_IM_MODULE=ibus' "$overrideResult"
  grep -qx 'QT_IM_MODULE=ibus' "$overrideResult"
  grep -qx 'XMODIFIERS=@im=ibus' "$overrideResult"

  touch "$out"
''
