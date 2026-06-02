#!/usr/bin/env python3
"""
Usage:
  python3 nb2_call.py <model> <prompt_file> <out_path> <ref1> [<ref2> ...]
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error
import re

def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env

env = load_env("/Users/alenaleonteva/.claude/laozhang.env")
KEY = env["LAOZHANG_API_KEY"]
BASE = env["LAOZHANG_BASE_URL"]

def call_nb2(model, prompt, ref_paths, out_path):
    content = [{"type": "text", "text": prompt}]
    for ref in ref_paths:
        with open(ref, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        ext = ref.split(".")[-1].lower()
        mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "stream": False
    }

    req = urllib.request.Request(
        f"{BASE}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print("HTTP ERROR", e.code, body)
        # фатальные (ретраить бессмысленно): нет баланса / квоты / доступа
        if e.code in (401, 403) or any(s in body for s in ("insufficient_quota", "配额", "余额", "invalid_api_key")):
            sys.exit(3)
        # временные (503 high demand / 429 / 5xx) — ретраить
        sys.exit(1)

    msg = data["choices"][0]["message"]
    content_resp = msg.get("content", "")

    print("--- USAGE ---")
    print(json.dumps(data.get("usage", {}), indent=2))

    m = re.search(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)', content_resp)
    if m:
        img_bytes = base64.b64decode(m.group(1))
        with open(out_path, "wb") as f:
            f.write(img_bytes)
        print(f"SAVED: {out_path} ({len(img_bytes)} bytes)")
        return out_path

    m = re.search(r'https?://[^\s\)]+\.(?:png|jpg|jpeg|webp)', content_resp)
    if m:
        url = m.group(0)
        urllib.request.urlretrieve(url, out_path)
        print(f"SAVED: {out_path}")
        return out_path

    print("!!! No image data found:")
    print(json.dumps(msg, indent=2)[:2000])
    sys.exit(2)

if __name__ == "__main__":
    model = sys.argv[1]
    prompt_file = sys.argv[2]
    out = sys.argv[3]
    refs = sys.argv[4:]
    with open(prompt_file) as f:
        prompt = f.read()
    call_nb2(model, prompt, refs, out)
