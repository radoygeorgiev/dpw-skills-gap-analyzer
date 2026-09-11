#!/usr/bin/env python3
import os
from pathlib import Path
import shutil

from startup_lifecycle import (CheckoutLock, install_shutdown_handlers, select_port,
                               spawn, stop_owned)

ROOT = Path(__file__).resolve().parents[1]


def main():
    name = os.getenv("STARTUP_NAME", "dpw-skills-gap-analyzer")
    with CheckoutLock(ROOT, name):
        install_shutdown_handlers()
        port = select_port("127.0.0.1", os.getenv("PORT", "5173"))
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        print(f"{name}: http://127.0.0.1:{port}", flush=True)
        process = spawn([npm, "exec", "--", "vite", "--host", "127.0.0.1",
                         "--port", str(port), "--strictPort"], ROOT)
        try:
            return process.wait()
        except KeyboardInterrupt:
            return 0
        finally:
            stop_owned([process])


if __name__ == "__main__":
    raise SystemExit(main())
