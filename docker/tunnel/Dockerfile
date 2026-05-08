FROM alpine:latest

# 必要なパッケージのインストール (su-exec削除)
RUN apk add --no-cache openssh-client

# 非ルートユーザーの作成とSSH用ディレクトリの準備
RUN addgroup -g 1000 tunneluser && \
    adduser -D -u 1000 -G tunneluser -h /home/tunneluser tunneluser && \
    mkdir -p /home/tunneluser/.ssh && \
    chown -R tunneluser:tunneluser /home/tunneluser

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# デフォルトでは作成したユーザーで実行
USER tunneluser

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
