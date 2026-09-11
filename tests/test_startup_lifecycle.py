import socket
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from unittest import mock
import errno
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import startup_lifecycle
from startup_lifecycle import (CheckoutLock, StartupError, port_available, select_port,
                               spawn, stop_owned, wait_http, listening_owned_by)


class LifecycleTests(unittest.TestCase):
    def test_occupied_port_advances_and_invalid_input_is_bounded(self):
        with socket.socket() as held:
            held.bind(("127.0.0.1", 0)); port = held.getsockname()[1]
            self.assertEqual(select_port("127.0.0.1", port), port + 1)
        for value in (0, 65536, "bad"):
            with self.assertRaises(StartupError): select_port("127.0.0.1", value)
        with self.assertRaises(StartupError): select_port("not a host !", 8000)

    def test_checkout_lock_refuses_concurrent_and_stale_file_is_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            first = CheckoutLock(Path(directory), "test").acquire()
            with self.assertRaises(StartupError): CheckoutLock(Path(directory), "test").acquire()
            first.close()
            CheckoutLock(Path(directory), "test").acquire().close()

    def test_disabled_ipv6_does_not_reject_available_ipv4(self):
        real_socket = socket.socket
        def factory(family, *args, **kwargs):
            if family == socket.AF_INET6:
                raise OSError(errno.EAFNOSUPPORT, "IPv6 disabled")
            return real_socket(family, *args, **kwargs)
        addresses=[(socket.AF_INET,socket.SOCK_STREAM,6,("127.0.0.1",0)),
                   (socket.AF_INET6,socket.SOCK_STREAM,6,("::1",0,0,0))]
        with mock.patch.object(startup_lifecycle,"_addresses",return_value=addresses), \
             mock.patch.object(startup_lifecycle.socket,"socket",side_effect=factory):
            self.assertGreater(select_port("localhost",49100),0)

    def test_ipv4_loopback_probe_also_rejects_ipv6_only_listener(self):
        try:
            held = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            held.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
            held.bind(("::1", 0)); port = held.getsockname()[1]
        except OSError as exc:
            self.skipTest(f"IPv6 unavailable: {exc}")
        with held:
            self.assertFalse(port_available("127.0.0.1", port))
            self.assertNotEqual(select_port("127.0.0.1", port), port)

    def test_ipv6_loopback_probe_rejects_ipv4_counterpart(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as held:
            held.bind(("127.0.0.1", 0)); port = held.getsockname()[1]
            try:
                self.assertFalse(port_available("::1", port))
                self.assertNotEqual(select_port("::1", port), port)
            except StartupError as exc:
                self.skipTest(f"IPv6 unavailable: {exc}")

    def test_ipv6_only_bind_when_supported(self):
        try:
            port=select_port("::1",49100)
        except StartupError as exc:
            self.skipTest(str(exc))
        self.assertGreaterEqual(port,49100)

    def test_windows_listener_requires_descendant_pid_proof(self):
        payload = '{"listeners":[303],"processes":[{"ProcessId":303,"ParentProcessId":202},{"ProcessId":202,"ParentProcessId":101}]}'
        completed = mock.Mock(stdout=payload)
        with mock.patch.object(startup_lifecycle.os, "name", "nt"), \
             mock.patch.object(startup_lifecycle.subprocess, "run", return_value=completed) as run:
            self.assertTrue(listening_owned_by(101, 8123))
        self.assertEqual(run.call_args.kwargs["timeout"], 3)

    def test_windows_listener_proof_failure_is_safe(self):
        with mock.patch.object(startup_lifecycle.os, "name", "nt"), \
             mock.patch.object(startup_lifecycle.subprocess, "run",
                               side_effect=subprocess.TimeoutExpired("powershell", 3)):
            self.assertFalse(listening_owned_by(101, 8123))

    @unittest.skipUnless(sys.platform.startswith("linux"), "process-group assertion is Linux-specific")
    def test_failure_cleanup_kills_only_owned_group(self):
        own = spawn([sys.executable, "-c", "import time; time.sleep(30)"], Path.cwd())
        foreign = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True)
        try:
            stop_owned([own])
            self.assertIsNotNone(own.poll()); self.assertIsNone(foreign.poll())
        finally:
            foreign.terminate(); foreign.wait()

    @unittest.skipUnless(sys.platform.startswith("linux"), "ownership assertion uses /proc")
    def test_identical_foreign_page_never_satisfies_readiness(self):
        class Page(BaseHTTPRequestHandler):
            def do_GET(self):
                body = b"<title>Automation Library</title>ok"
                self.send_response(200); self.end_headers(); self.wfile.write(body)
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Page)
        thread = __import__("threading").Thread(target=server.serve_forever, daemon=True)
        thread.start()
        child = spawn([sys.executable, "-c", "import time; time.sleep(10)"], Path.cwd())
        try:
            with self.assertRaises(StartupError):
                wait_http(f"http://127.0.0.1:{server.server_port}/", [child],
                          server.server_port, timeout=.35, identity="Automation Library")
        finally:
            stop_owned([child]); server.shutdown(); server.server_close()

    @unittest.skipUnless(sys.platform.startswith("linux"), "ownership assertion uses /proc")
    def test_owned_unauthenticated_redirect_to_login_is_ready(self):
        port = select_port("127.0.0.1", 49150)
        code = textwrap.dedent(f"""
            from http.server import BaseHTTPRequestHandler, HTTPServer
            class H(BaseHTTPRequestHandler):
                def do_GET(self):
                    if self.path != '/login':
                        self.send_response(302); self.send_header('Location','/login'); self.end_headers()
                    else:
                        self.send_response(200); self.end_headers(); self.wfile.write(b'login')
                def log_message(self,*args): pass
            HTTPServer(('127.0.0.1',{port}),H).serve_forever()
        """)
        child = spawn([sys.executable, "-c", code], Path.cwd())
        try:
            wait_http(f"http://127.0.0.1:{port}/protected", [child], port, timeout=5)
        finally:
            stop_owned([child])

    @unittest.skipUnless(sys.platform.startswith("linux"), "process-group assertion is Linux-specific")
    def test_exited_parent_descendant_listener_is_removed_not_foreign(self):
        foreign = socket.socket(); foreign.bind(("127.0.0.1", 0)); foreign.listen()
        port = select_port("127.0.0.1", 49000)
        code = textwrap.dedent(f"""
            import subprocess, sys
            subprocess.Popen([sys.executable, '-c',
                'import socket,time; s=socket.socket(); s.bind((\"127.0.0.1\",{port})); s.listen(); time.sleep(30)'])
        """)
        parent = spawn([sys.executable, "-c", code], Path.cwd())
        parent.wait(timeout=5)
        deadline = time.monotonic() + 5
        while port_available("127.0.0.1", port) and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertFalse(port_available("127.0.0.1", port))
        stop_owned([parent])
        deadline = time.monotonic() + 5
        while not port_available("127.0.0.1", port) and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertTrue(port_available("127.0.0.1", port))
        foreign.getsockname(); foreign.close()

    @unittest.skipUnless(sys.platform.startswith("linux"), "signal regression is POSIX-specific")
    def test_sigterm_unwinds_finally_and_closes_child_port(self):
        port = select_port("127.0.0.1", 49200)
        helper_dir = str(Path(startup_lifecycle.__file__).parent)
        script = textwrap.dedent(f"""
            import sys, time
            sys.path.insert(0, {helper_dir!r})
            from startup_lifecycle import install_shutdown_handlers, spawn, stop_owned
            processes=[]
            install_shutdown_handlers()
            try:
                processes.append(spawn([sys.executable, '-c',
                    'import socket,time; s=socket.socket(); s.bind((\"127.0.0.1\",{port})); s.listen(); time.sleep(30)'], '.'))
                while True: time.sleep(.1)
            except KeyboardInterrupt: pass
            finally: stop_owned(processes)
        """)
        launcher = subprocess.Popen([sys.executable, "-c", script])
        try:
            deadline = time.monotonic() + 5
            while port_available("127.0.0.1", port) and time.monotonic() < deadline: time.sleep(.05)
            launcher.terminate(); launcher.wait(timeout=8)
            self.assertTrue(port_available("127.0.0.1", port))
        finally:
            if launcher.poll() is None: launcher.kill(); launcher.wait()


class LauncherParentTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith("linux"), "Linux npm-parent regression")
    def test_outer_launcher_exit_stops_supervisor_and_server(self):
        port = select_port("127.0.0.1", 49300)
        helper_dir = str(Path(startup_lifecycle.__file__).parent)
        supervisor = textwrap.dedent(f"""
            import sys,time
            sys.path.insert(0,{helper_dir!r})
            from startup_lifecycle import install_shutdown_handlers,spawn,stop_owned
            children=[]
            install_shutdown_handlers()
            try:
                children.append(spawn([sys.executable,'-c',
                    'import socket,time; s=socket.socket(); s.bind(("127.0.0.1",{port})); s.listen(); time.sleep(30)'],'.'))
                while True: time.sleep(.1)
            except KeyboardInterrupt: pass
            finally: stop_owned(children)
        """)
        outer_code = (
            "import subprocess,sys,time; "
            f"p=subprocess.Popen([sys.executable,'-c',{supervisor!r}]); "
            "print(p.pid,flush=True); time.sleep(30)"
        )
        outer = subprocess.Popen([sys.executable, "-c", outer_code], stdout=subprocess.PIPE, text=True)
        supervisor_pid = int(outer.stdout.readline())
        try:
            deadline = time.monotonic() + 5
            while port_available("127.0.0.1", port) and time.monotonic() < deadline:
                time.sleep(.05)
            self.assertFalse(port_available("127.0.0.1", port))
            outer.terminate(); outer.wait(timeout=5)
            deadline = time.monotonic() + 5
            while not port_available("127.0.0.1", port) and time.monotonic() < deadline:
                time.sleep(.05)
            self.assertTrue(port_available("127.0.0.1", port))
        finally:
            if outer.poll() is None:
                outer.terminate(); outer.wait(timeout=5)
            outer.stdout.close()
            try: startup_lifecycle.os.kill(supervisor_pid, startup_lifecycle.signal.SIGTERM)
            except ProcessLookupError: pass

    def test_windows_job_is_assigned_before_bootstrap_is_released(self):
        events = []
        kernel = mock.Mock()
        kernel.AssignProcessToJobObject.side_effect = lambda *_: events.append("assigned") or 1
        proc = mock.Mock()
        proc._handle = 123
        proc.stdin.write.side_effect = lambda data: events.append(data)
        with mock.patch.object(startup_lifecycle.os, "name", "nt"), \
             mock.patch.object(startup_lifecycle, "_windows_job", return_value=(kernel, 456)), \
             mock.patch.object(startup_lifecycle.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, create=True), \
             mock.patch.object(startup_lifecycle.subprocess, "Popen", return_value=proc) as popen:
            self.assertIs(spawn(["server", "--port", "8000"], "."), proc)
        self.assertEqual(events, ["assigned", b"start\n"])
        self.assertEqual(popen.call_args.kwargs["creationflags"], 512)
        self.assertIn("sys.stdin.buffer.readline", popen.call_args.args[0][2])
        proc.stdin.close.assert_called_once()


if __name__ == "__main__": unittest.main()
