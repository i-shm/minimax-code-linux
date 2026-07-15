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

  # The login page always loads chunk 9360.  Its shared environment module
  # must report Chinese rather than accidentally retaining isEnglish=true;
  # otherwise the user bootstrap client resolves agent.minimax.io.
  ! grep -aqP 'a1:function\(\)\{return d\}[^\n]*c=!0,d=!0,u=!1' "$appAsar"
  grep -aqP 'a1:function\(\)\{return d\}[^\n]*c=!0,d=!1,u=!1' "$appAsar"

  # initUserInfo uses this Axios client for token renewal and user lookup.
  ! grep -aqF 'baseURL:o.d&&!o.r8?"https://agent.minimax.io":void 0' "$appAsar"
  ! grep -aqF 'let a=e.baseURL||"https://agent.minimax.io"' "$appAsar"
  grep -aqF 'baseURL:o.d&&!o.r8?"https://agent.minimaxi.com":void 0' "$appAsar"
  grep -aqF 'let a=e.baseURL||"https://agent.minimaxi.com"' "$appAsar"

  touch "$out"
''
