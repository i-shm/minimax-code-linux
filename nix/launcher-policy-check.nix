{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-launcher-policy" {
  nativeBuildInputs = [ gnugrep ];
} ''
  launcher=${minimax-agent}/bin/minimax-agent

  test -x "$launcher"
  ! grep -F -- '--no-sandbox' "$launcher"
  ! grep -F -- '/opt/minimax-agent' "$launcher"
  ! grep -F -- '/usr/bin/minimax-agent' "$launcher"

  sandbox=${minimax-agent}/lib/minimax-agent/chrome-sandbox
  if [ -e "$sandbox" ]; then
    test ! -u "$sandbox"
    test ! -g "$sandbox"
  fi

  touch "$out"
''
