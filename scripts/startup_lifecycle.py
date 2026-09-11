"""Small, dependency-free startup primitives shared by this repository's launchers."""
from __future__ import annotations

import errno
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request


class StartupError(RuntimeError):
    pass


def valid_port(value: object) -> int:
    try:
        port = int(str(value), 10)
    except (TypeError, ValueError) as exc:
        raise StartupError(f"invalid port: {value!r}") from exc
    if not 1 <= port <= 65535:
        raise StartupError(f"port outside 1..65535: {port}")
    return port


def _addresses(host: str):
    if not host or any(c.isspace() for c in host):
        raise StartupError(f"invalid bind host: {host!r}")
    try:
        infos = socket.getaddrinfo(host, 0, type=socket.SOCK_STREAM,
                                   flags=socket.AI_PASSIVE)
    except socket.gaierror as exc:
        raise StartupError(f"invalid bind host {host!r}: {exc}") from exc
    result = []
    for family, kind, proto, _, address in infos:
        item = (family, kind, proto, address)
        if family in (socket.AF_INET, socket.AF_INET6) and item not in result:
            result.append(item)
    counterpart = {"127.0.0.1": ("::1", socket.AF_INET6),
                   "0.0.0.0": ("::", socket.AF_INET6),
                   "::1": ("127.0.0.1", socket.AF_INET),
                   "::": ("0.0.0.0", socket.AF_INET)}.get(host)
    if counterpart:
        try:
            extra = socket.getaddrinfo(counterpart[0], 0, counterpart[1],
                                       socket.SOCK_STREAM, 0, socket.AI_PASSIVE)
        except socket.gaierror:
            extra = []
        for family, kind, proto, _, address in extra:
            item = (family, kind, proto, address)
            if item not in result:
                result.append(item)
    if not result:
        raise StartupError(f"host has no usable IP address: {host!r}")
    return result


def port_available(host: str, port: object) -> bool:
    """Return bind availability; an unavailable IPv6 family does not poison IPv4."""
    port = valid_port(port)
    attempted = 0
    for family, kind, proto, address in _addresses(host):
        probe = None
        try:
            probe = socket.socket(family, kind, proto)
            if os.name == "nt":
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            if family == socket.AF_INET6:
                try:
                    probe.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                except OSError:
                    pass
            target = (address[0], port, *address[2:])
            probe.bind(target)
            attempted += 1
        except OSError as exc:
            unsupported = exc.errno in (errno.EAFNOSUPPORT, errno.EPROTONOSUPPORT,
                                         errno.EADDRNOTAVAIL)
            if unsupported and family == socket.AF_INET6:
                continue
            if exc.errno in (errno.EADDRINUSE, errno.EACCES) or getattr(exc, "winerror", 0) in (10013, 10048):
                return False
            raise StartupError(f"cannot probe {host}:{port}: {exc}") from exc
        finally:
            if probe is not None:
                probe.close()
    if not attempted:
        raise StartupError(f"no supported address family for {host!r}")
    return True


def select_port(host: str, preferred: object, excluded=(), attempts: int = 100) -> int:
    preferred = valid_port(preferred)
    excluded = {valid_port(p) for p in excluded}
    stop = min(65535, preferred + max(1, attempts) - 1)
    for port in range(preferred, stop + 1):
        if port not in excluded and port_available(host, port):
            return port
    raise StartupError(f"no free port in bounded range {preferred}..{stop}")


class CheckoutLock:
    """Kernel-held, stale-safe lock unique to a checkout and launcher name."""
    def __init__(self, root: Path, name: str):
        digest = hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:16]
        base = Path(os.getenv("LOCALAPPDATA") or os.getenv("XDG_RUNTIME_DIR") or
                    os.getenv("TEMP") or "/tmp")
        self.path = base / f"startup-{name}-{digest}.lock"
        self.file = None

    def acquire(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+")
        try:
            if os.name == "nt":
                import msvcrt
                self.file.seek(0)
                self.file.write("0")
                self.file.flush()
                self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.file.close()
            self.file = None
            raise StartupError("this checkout is already running or starting") from exc
        self.file.seek(0)
        self.file.truncate()
        self.file.write(str(os.getpid()))
        self.file.flush()
        return self

    def close(self):
        if self.file:
            self.file.close()
            self.file = None

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *_):
        self.close()


def listening_owned_by(pid: int, port: int) -> bool:
    """Prove that pid or one of its descendants owns a listener on port."""
    if os.name == "nt":
        script = (
            "$ErrorActionPreference='Stop';"
            "$l=@(Get-NetTCPConnection -State Listen -LocalPort " + str(port) +
            " | Select-Object -ExpandProperty OwningProcess -Unique);"
            "$p=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId);"
            "@{listeners=$l;processes=$p}|ConvertTo-Json -Compress -Depth 3"
        )
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive",
                 "-Command", script], capture_output=True, text=True, timeout=3,
                check=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            data = json.loads(result.stdout)
            listener_values = data.get("listeners", [])
            if not isinstance(listener_values, list):
                listener_values = [listener_values]
            listeners = {int(value) for value in listener_values}
            rows = data.get("processes", [])
            if isinstance(rows, dict):
                rows = [rows]
            parents = {int(row["ProcessId"]): int(row["ParentProcessId"])
                       for row in rows}
            for listener in listeners:
                current, seen = listener, set()
                while current and current not in seen:
                    if current == pid:
                        return True
                    seen.add(current)
                    current = parents.get(current, 0)
        except (OSError, subprocess.SubprocessError, ValueError, TypeError,
                json.JSONDecodeError):
            return False
        return False
    if not sys.platform.startswith("linux"):
        return False
    wanted = set()
    for table in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
        try:
            lines = table.read_text().splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            fields = line.split()
            if fields[3] == "0A" and int(fields[1].rsplit(":", 1)[1], 16) == port:
                wanted.add(f"socket:[{fields[9]}]")
    descendants = {pid}
    changed = True
    while changed:
        changed = False
        for entry in Path("/proc").glob("[0-9]*"):
            try:
                child = int(entry.name)
                parent = int((entry / "stat").read_text().rsplit(")", 1)[1].split()[1])
            except (OSError, ValueError, IndexError):
                continue
            if parent in descendants and child not in descendants:
                descendants.add(child); changed = True
    for child in descendants:
        try:
            if any(os.readlink(fd) in wanted for fd in (Path("/proc") / str(child) / "fd").iterdir()):
                return True
        except OSError:
            pass
    return False


def wait_http(url: str, processes, port: int, timeout=45, identity=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(p.poll() is not None for p in processes):
            raise StartupError("a child exited during startup")
        try:
            with opener.open(url, timeout=1) as response:
                response.read(1)
                if 200 <= response.status < 400:
                    if any(p.poll() is not None for p in processes):
                        raise StartupError("a child exited during startup")
                    if any(listening_owned_by(p.pid, port) for p in processes):
                        if any(p.poll() is not None for p in processes):
                            raise StartupError("a child exited during startup")
                        return
        except OSError:
            pass
        time.sleep(.15)
    raise StartupError(f"child did not own a ready endpoint at {url}")


def _windows_job():
    import ctypes
    from ctypes import wintypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    ULONG_PTR = ctypes.c_size_t
    class BASIC_LIMIT(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong),
                    ("PerJobUserTimeLimit", ctypes.c_longlong), ("LimitFlags", wintypes.DWORD),
                    ("MinimumWorkingSetSize", ULONG_PTR), ("MaximumWorkingSetSize", ULONG_PTR),
                    ("ActiveProcessLimit", wintypes.DWORD), ("Affinity", ULONG_PTR),
                    ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]
    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in
                    ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                     "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]
    class EXTENDED_LIMIT(ctypes.Structure):
        _fields_ = [("BasicLimitInformation", BASIC_LIMIT), ("IoInfo", IO_COUNTERS),
                    ("ProcessMemoryLimit", ULONG_PTR), ("JobMemoryLimit", ULONG_PTR),
                    ("PeakProcessMemoryUsed", ULONG_PTR), ("PeakJobMemoryUsed", ULONG_PTR)]
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int,
                                                  ctypes.c_void_p, wintypes.DWORD]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel32.TerminateJobObject.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")
    limits = EXTENDED_LIMIT()
    limits.BasicLimitInformation.LimitFlags = 0x00002000
    if not kernel32.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
        error = ctypes.get_last_error(); kernel32.CloseHandle(job)
        raise OSError(error, "SetInformationJobObject failed")
    return kernel32, job


def spawn(command, cwd, env=None):
    if os.name == "nt":
        kernel32, job = _windows_job()
        proc = None
        try:
            # Popen closes the native primary-thread handle. Gate a Python
            # wrapper on stdin instead of relying on a nonexistent _thread.
            # No server child can start before job assignment succeeds.
            bootstrap = (
                "import json,subprocess,sys; "
                "go=sys.stdin.buffer.readline(); "
                "sys.exit(subprocess.call(json.loads(sys.argv[1])) "
                "if go == b'start\\n' else 1)"
            )
            proc = subprocess.Popen(
                [sys.executable, "-c", bootstrap, json.dumps(list(command))],
                cwd=cwd, env=env, stdin=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
            if not kernel32.AssignProcessToJobObject(job, proc._handle):
                raise OSError(__import__("ctypes").get_last_error(), "AssignProcessToJobObject failed")
            proc._startup_job = (kernel32, job)
            proc.stdin.write(b"start\n")
            proc.stdin.flush()
            proc.stdin.close()
            return proc
        except BaseException:
            kernel32.TerminateJobObject(job, 1)
            if proc is not None and proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=5)
            kernel32.CloseHandle(job)
            raise
    proc = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
    try:
        if os.getpgid(proc.pid) != proc.pid or os.getsid(proc.pid) != proc.pid:
            raise StartupError("spawned process did not enter its owned session")
    except BaseException:
        proc.terminate(); proc.wait()
        raise
    proc._startup_pgid = proc.pid
    return proc


def _group_live(pgid):
    if sys.platform.startswith("linux"):
        for entry in Path("/proc").glob("[0-9]*/stat"):
            try:
                fields = entry.read_text().rsplit(")", 1)[1].split()
                if fields[0] != "Z" and int(fields[2]) == pgid and int(fields[3]) == pgid:
                    return True
            except (OSError, ValueError, IndexError):
                pass
        return False
    try:
        os.killpg(pgid, 0); return True
    except ProcessLookupError:
        return False


def stop_owned(processes):
    for proc in reversed(processes):
        if os.name == "nt":
            job = getattr(proc, "_startup_job", None)
            if job:
                job[0].TerminateJobObject(job[1], 1)
        else:
            pgid = getattr(proc, "_startup_pgid", None)
            if pgid is not None and _group_live(pgid):
                try: os.killpg(pgid, signal.SIGTERM)
                except ProcessLookupError: pass
    deadline = time.monotonic() + 5
    while os.name != "nt" and time.monotonic() < deadline:
        if not any(_group_live(getattr(p, "_startup_pgid", -1)) for p in processes):
            break
        time.sleep(.05)
    if os.name != "nt":
        for proc in processes:
            pgid = getattr(proc, "_startup_pgid", None)
            if pgid is not None and _group_live(pgid):
                try: os.killpg(pgid, signal.SIGKILL)
                except ProcessLookupError: pass
    for proc in processes:
        try: proc.wait(timeout=1)
        except subprocess.TimeoutExpired: pass
        job = getattr(proc, "_startup_job", None)
        if job:
            job[0].CloseHandle(job[1]); proc._startup_job = None


_shutdown_watch_started = False


def _watch_launcher_ancestors():
    """npm does not reliably forward TERM; retain the original launcher chain."""
    global _shutdown_watch_started
    if _shutdown_watch_started or not sys.platform.startswith("linux"):
        return
    ancestors = []
    pid = os.getppid()
    while pid > 1 and len(ancestors) < 64:
        try:
            fields = (Path("/proc") / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()
            ancestors.append((pid, fields[19]))
            pid = int(fields[1])
        except (OSError, ValueError, IndexError):
            break
    if not ancestors:
        return
    _shutdown_watch_started = True

    def watch():
        while True:
            time.sleep(.25)
            for pid, started in ancestors:
                try:
                    fields = (Path("/proc") / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()
                    alive = fields[0] not in ("Z", "X") and fields[19] == started
                except (OSError, IndexError):
                    alive = False
                if not alive:
                    os.kill(os.getpid(), signal.SIGTERM)
                    return

    threading.Thread(target=watch, name="launcher-parent-watch", daemon=True).start()


def install_shutdown_handlers():
    """Make termination unwind Python finally blocks; call only from main()."""
    if threading.current_thread() is not threading.main_thread():
        raise StartupError("shutdown handlers must be installed on the main thread")
    shutting_down = False
    def interrupt(_signum, _frame):
        nonlocal shutting_down
        if shutting_down:
            return
        shutting_down = True
        raise KeyboardInterrupt
    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    if os.name != "nt" and hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, interrupt)
    _watch_launcher_ancestors()
