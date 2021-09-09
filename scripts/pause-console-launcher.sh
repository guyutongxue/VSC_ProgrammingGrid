#!/bin/bash
###
# https://github.com/Guyutongxue/VSCodeConfigHelper3/blob/main/scripts/pause-console-launcher.sh

escaped_args=()
for arg in "$@"; do
    quoted="\"${arg//\"/\\\"}\""
    quoted=${quoted//\\/\\\\}
    quoted=${quoted//\"/\\\"}
    escaped_args+=($quoted)
done

cwd=$(dirname "$BASH_SOURCE")
cwd="\"${cwd//\"/\\\"}\""
cwd=${cwd//\\/\\\\}
cwd=${cwd//\"/\\\"}

osascript > /dev/null <<EOF
tell application "Terminal"
    do script "cd ${cwd}; clear; ./pause-console.rb ${escaped_args[@]}; exit"
end tell
EOF