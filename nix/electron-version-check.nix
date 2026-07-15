{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-electron-version" {
  nativeBuildInputs = [ gnugrep ];
} ''
  grep -Fx '33.4.11' ${minimax-agent}/lib/minimax-agent/version
  touch "$out"
''
