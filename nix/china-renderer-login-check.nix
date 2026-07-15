{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-china-renderer-login" {
  nativeBuildInputs = [ gnugrep ];
} ''
  appAsar=${minimax-agent}/lib/minimax-agent/resources/app.asar

  # The renderer's login module selects account.minimax.io when its compiled
  # "is English" flag is true. Both renderer module variants must be Chinese.
  ! grep -aqF 'REGION:"en"' "$appAsar"
  grep -aqF 'u=!1,S=!1,d={MODE:"production",REGION:"zh"' "$appAsar"
  grep -aqF 'd=!1,h=!1,g="__MX_INIT_STORE__"' "$appAsar"

  touch "$out"
''
