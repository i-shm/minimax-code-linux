{
  coreutils,
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-desktop-integration" {
  nativeBuildInputs = [ gnugrep ];
} ''
  desktop=${minimax-agent}/share/applications/minimax-agent.desktop
  icon=${minimax-agent}/share/icons/hicolor/256x256/apps/minimax-agent.png

  pngHex() {
    ${coreutils}/bin/od -An -j "$2" -N "$3" -t x1 "$1" | ${coreutils}/bin/tr -d '[:space:]'
  }

  grep -Fx 'Icon=minimax-agent' "$desktop"
  test -s "$icon"
  test "$(pngHex "$icon" 0 8)" = '89504e470d0a1a0a'
  test "$(pngHex "$icon" 16 8)" = '0000010000000100'

  touch "$out"
''
