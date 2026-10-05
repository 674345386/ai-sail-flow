#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo on the Linux production host." >&2
  exit 1
fi

interface=$(ip -4 route show default | awk 'NR == 1 { for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i+1); exit } }')
if [[ -z ${interface} ]]; then
  echo "No default IPv4 interface found." >&2
  exit 1
fi

case ${1:-install} in
  --runtime)
    modprobe tcp_bbr
    modprobe sch_fq
    sysctl -w net.core.default_qdisc=fq net.ipv4.tcp_congestion_control=bbr
    tc qdisc replace dev "$interface" root fq
    ;;
  --rollback)
    # Restore this host's measured pre-tuning defaults, including future connections.
    systemctl disable --now ai-sail-flow-network-tuning.service
    rm -f /etc/systemd/system/ai-sail-flow-network-tuning.service \
      /etc/sysctl.d/99-ai-sail-flow-network.conf \
      /etc/modules-load.d/ai-sail-flow-network.conf
    systemctl daemon-reload
    sysctl -w net.core.default_qdisc=fq_codel net.ipv4.tcp_congestion_control=cubic
    tc qdisc replace dev "$interface" root fq_codel
    ;;
  install)
    source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
    # Check kernel support before writing any persistent configuration.
    modprobe tcp_bbr
    modprobe sch_fq
    install -m 0644 "$source_dir/deploy/99-ai-sail-flow-network.conf" /etc/sysctl.d/99-ai-sail-flow-network.conf
    printf 'tcp_bbr\nsch_fq\n' > /etc/modules-load.d/ai-sail-flow-network.conf
    install -m 0755 "${BASH_SOURCE[0]}" /usr/local/sbin/ai-sail-flow-network-tuning
    cat > /etc/systemd/system/ai-sail-flow-network-tuning.service <<'UNIT'
[Unit]
Description=AI-Sail Flow HTTPS TCP pacing
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ai-sail-flow-network-tuning --runtime
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable ai-sail-flow-network-tuning.service
    systemctl restart ai-sail-flow-network-tuning.service
    ;;
  *) echo "Usage: $0 [install|--runtime|--rollback]" >&2; exit 2 ;;
esac

sysctl net.core.default_qdisc net.ipv4.tcp_congestion_control
tc qdisc show dev "$interface"
