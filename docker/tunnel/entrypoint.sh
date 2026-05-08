#!/bin/sh
set -e

echo "トンネルサービスを起動しています..."

# SSHコマンドを実行
# compose.yml の command 引数が "$@" として渡される
exec ssh "$@"
