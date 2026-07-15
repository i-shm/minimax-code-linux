{
  gnugrep,
  minimax-agent,
  runCommand,
}:

runCommand "minimax-agent-deep-link-compatibility" {
  nativeBuildInputs = [ gnugrep ];
} ''
  appAsar=${minimax-agent}/lib/minimax-agent/resources/app.asar

  grep -aF "const DEEP_LINK_PROTOCOL_ALIASES = [exports.PROTOCOL_NAME, 'minimax', 'minimax-cn'];" "$appAsar"
  grep -aF 'const protocol = getDeepLinkProtocol(url);' "$appAsar"

  touch "$out"
''
