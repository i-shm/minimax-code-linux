{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-domestic-deep-link-protocol" {
  nativeBuildInputs = [ gnugrep ];
} ''
  desktopFile=${minimax-agent}/share/applications/minimax-agent.desktop

  test -f "$desktopFile"
  grep -Fx "Exec=${minimax-agent}/bin/minimax-agent %U" "$desktopFile"
  grep -F 'x-scheme-handler/minimax-cn' "$desktopFile"

  touch "$out"
''
