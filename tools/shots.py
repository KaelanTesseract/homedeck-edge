"""Screenshots of Homedeck (sample data) with headless Edge over the DevTools protocol.

Usage:
  python tools/shots.py <outdir> [--port 5523] [--hash 'lang=de&panel=climate.bedroom'] <WxH> ...
  python tools/shots.py docs/images --readme      the images used in the READMEs
Needs the dev server: python -m http.server 5523 --bind 127.0.0.1 --directory widget  (pip install websockets pillow)
"""
import asyncio, base64, io, json, os, subprocess, sys, tempfile, time, urllib.request
import websockets
from PIL import Image

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DBG = 9334


class Tab:
    def __init__(self, ws):
        self.ws, self.i = ws, 0

    async def call(self, method, **params):
        self.i += 1
        my = self.i
        await self.ws.send(json.dumps({"id": my, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == my:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})


async def shoot(url, w, h):
    req = urllib.request.Request(f"http://127.0.0.1:{DBG}/json/new?about:blank", method="PUT")
    info = json.loads(urllib.request.urlopen(req).read())
    async with websockets.connect(info["webSocketDebuggerUrl"], max_size=2**28) as ws:
        t = Tab(ws)
        await t.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
        await t.call("Page.enable")
        await t.call("Page.navigate", url=url)
        for _ in range(100):  # boot waits ~1.5 s for iCUE before it shows sample data
            r = await t.call("Runtime.evaluate", returnByValue=True, expression=
                "!!(document.querySelector('.tile .v') && document.querySelector('.tile .v').textContent"
                " && document.readyState === 'complete')")
            if r.get("result", {}).get("value"):
                break
            await asyncio.sleep(0.1)
        await asyncio.sleep(1.2)  # glow and panel fade-in
        r = await t.call("Page.captureScreenshot", format="png")
    urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json/close/{info['id']}")
    return Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")


README = [  # (file, size, hash)
    ("hero.png", "1688x696", "lang=en"),
    ("hero-de.png", "1688x696", "lang=de"),
    ("panel-light.png", "840x696", "lang=en&panel=light.living_room"),
    ("panel-climate.png", "840x696", "lang=en&panel=climate.bedroom"),
]


async def main():
    args = sys.argv[1:]
    outdir = args.pop(0)
    port, hsh, readme = "5523", "lang=en", False
    while args and args[0].startswith("--"):
        k = args.pop(0)
        if k == "--port": port = args.pop(0)
        if k == "--hash": hsh = args.pop(0)
        if k == "--readme": readme = True
    os.makedirs(outdir, exist_ok=True)
    prof = tempfile.mkdtemp(prefix="hdc-cdp-")
    proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={DBG}", f"--user-data-dir={prof}",
                             "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json/version"); break
            except Exception:
                time.sleep(0.2)
        jobs = README if readme else [(f"homedeck-{s}.png", s, hsh) for s in args]
        for name, size, h in jobs:
            w, hh = map(int, size.split("x"))
            im = await shoot(f"http://127.0.0.1:{port}/index.html#{h}", w, hh)
            dest = os.path.join(outdir, name); im.save(dest); print(dest)
    finally:
        proc.kill()
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


asyncio.run(main())
