{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-linux-tray" {
  nativeBuildInputs = [ gnugrep ];
} ''
  archive=${minimax-agent}/lib/minimax-agent/resources/app.asar

  test -f "$archive"
  grep -aPzq "if \\(process\\.platform === 'linux'\\) \\{[[:space:]]*t\\.setContextMenu\\(createContextMenu\\(\\)\\);[[:space:]]*t\\.on\\('click', \\(\\) => \\{[[:space:]]*\\(0, window_1\\.bringToFront\\)\\(\\);[[:space:]]*\\}\\);[[:space:]]*return;[[:space:]]*\\}" "$archive"
  grep -aPzq "label: isEnLanguage \\? 'Show MiniMax Code' : '显示 MiniMax Code',[[:space:]]*click: \\(\\) => \\{[[:space:]]*\\(0, window_1\\.bringToFront\\)\\(\\);[[:space:]]*\\}," "$archive"

  touch "$out"
''
