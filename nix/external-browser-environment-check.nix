{
  coreutils,
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-external-browser-environment" {
  nativeBuildInputs = [ coreutils gnugrep ];
} ''
  launcher=${minimax-agent}/bin/minimax-agent
  openerDir=${minimax-agent}/libexec/minimax-agent
  opener=$openerDir/xdg-open

  test -x "$launcher"
  test -x "$opener"
  grep -Fx 'unset LD_LIBRARY_PATH' "$opener"
  grep -Fx 'unset LD_PRELOAD' "$opener"
  grep -F -- "$openerDir" "$launcher"

  touch "$out"
''
