{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-china-locale" {
  nativeBuildInputs = [ gnugrep ];
} ''
  appAsar=${minimax-agent}/lib/minimax-agent/resources/app.asar

  grep -aF 'NEXT_PUBLIC_BUILD_ENV="prod"' "$appAsar"
  grep -aF 'NEXT_PUBLIC_ENV="electron"' "$appAsar"
  grep -aF 'NEXT_PUBLIC_DOMAIN_URL="https://agent.minimaxi.com"' "$appAsar"
  grep -aF 'NEXT_PUBLIC_AUTH_API_URL="https://chat.minimaxi.com"' "$appAsar"
  grep -aF 'NEXT_PUBLIC_WEBSOCKET_HOST="wss://agent.minimaxi.com"' "$appAsar"
  grep -aF 'NEXT_PUBLIC_LOCALE="zh"' "$appAsar"
  grep -aF 'OSS_TYPE=matrix_oss' "$appAsar"

  touch "$out"
''
