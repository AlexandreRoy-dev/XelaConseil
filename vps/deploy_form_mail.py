#!/usr/bin/env python3
"""Deploy the Xela form-mail API onto the DuProprio OVH VPS."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("VPS_HOST", "158.69.1.173")
USER = os.environ.get("VPS_USER", "ubuntu")
KEY = os.path.expanduser(os.environ.get("VPS_SSH_KEY", "~/.ssh/ovh_vps"))
LOCAL = Path(__file__).resolve().parent
REMOTE = "/opt/xela-form"
NGINX_EXISTING = "/etc/nginx/sites-enabled/leads.devis-expert.ca"
LOCATION_MARKER = "location /xela"
LOCATION_BLOCK = """
    location /xela {
        proxy_pass http://127.0.0.1:8791/xela;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Origin $http_origin;
        proxy_read_timeout 30s;
    }
"""


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 90) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"{cmd}\nexit {code}\n{err or out}")
    return out


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, key_filename=KEY, timeout=30)
    sftp = client.open_sftp()

    run(client, f"sudo mkdir -p {REMOTE}")
    run(client, f"sudo chown -R ubuntu:ubuntu {REMOTE}")

    for name in ("form-mail.mjs", "xela-form-mail.service", "nginx-forms.govortex.com.conf"):
        sftp.put(str(LOCAL / name), f"{REMOTE}/{name}")
        print("uploaded", name)

    run(
        client,
        r"""sudo python3 - <<'PY'
from pathlib import Path
src = Path("/root/duproprio-lead-pipeline/.env")
dst = Path("/opt/xela-form/.env")
wanted = ("SMTP_HOST", "SMTP_PORT", "SMTP_USE_TLS", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM")
values = {}
if src.exists():
    for line in src.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        if key in wanted and key not in values:
            values[key] = val
lines = [f"{k}={values[k]}" for k in wanted if k in values]
lines.extend([
    "EMAIL_TO=info@xelaconseil.ca",
    "PORT=8791",
    "HOST=127.0.0.1",
    "ALLOWED_ORIGINS=https://xelaconseil.ca,https://www.xelaconseil.ca,https://alexandreroy-dev.github.io,http://localhost:4173,http://127.0.0.1:4173,http://localhost:5500,http://127.0.0.1:5500",
])
dst.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("env_keys", ",".join(line.split("=", 1)[0] for line in lines))
PY""",
    )
    run(client, "sudo chown ubuntu:ubuntu /opt/xela-form/.env && sudo chmod 600 /opt/xela-form/.env")
    run(
        client,
        f"test -f {REMOTE}/package.json || printf '%s\\n' '{{\"name\":\"xela-form\",\"private\":true}}' > {REMOTE}/package.json",
    )
    run(client, f"cd {REMOTE} && npm install --omit=dev nodemailer@6", timeout=120)
    run(client, f"sudo cp {REMOTE}/xela-form-mail.service /etc/systemd/system/xela-form-mail.service")
    run(client, "sudo systemctl daemon-reload")
    run(client, "sudo systemctl enable --now xela-form-mail.service")
    run(client, "sudo systemctl restart xela-form-mail.service")
    status = run(client, "sudo systemctl is-active xela-form-mail.service").strip()
    print("service", status)
    if status != "active":
        print(run(client, "sudo journalctl -u xela-form-mail.service -n 40 --no-pager"))
        return 1

    nginx = run(client, f"sudo cat {NGINX_EXISTING}")
    if LOCATION_MARKER not in nginx:
        patched = nginx.replace("    location / {", LOCATION_BLOCK + "\n    location / {", 1)
        tmp = "/tmp/leads.devis-expert.ca.xela"
        with sftp.file(tmp, "w") as handle:
            handle.write(patched)
        run(client, f"sudo cp {tmp} {NGINX_EXISTING}")
        print("nginx location added on leads.devis-expert.ca")
    else:
        print("nginx location already present")

    run(client, f"sudo cp {REMOTE}/nginx-forms.govortex.com.conf /etc/nginx/sites-available/forms.govortex.com")
    run(client, "sudo ln -sfn /etc/nginx/sites-available/forms.govortex.com /etc/nginx/sites-enabled/forms.govortex.com")
    run(client, "sudo nginx -t")
    run(client, "sudo systemctl reload nginx")

    health = run(client, "curl -sS http://127.0.0.1:8791/health").strip()
    print("health", health)
    public = run(client, "curl -sS -o /dev/null -w '%{http_code}' https://leads.devis-expert.ca/xela -X OPTIONS -H 'Origin: https://xelaconseil.ca' -H 'Access-Control-Request-Method: POST'").strip()
    print("public OPTIONS", public)

    sftp.close()
    client.close()
    return 0 if status == "active" else 1


if __name__ == "__main__":
    sys.exit(main())
