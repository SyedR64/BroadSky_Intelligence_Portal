"""Start and stop the mock Claude API and backend instances for tests (standard library only)."""

import os
import socket
import subprocess
import sys
import time
import urllib.request

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS_DIR = os.path.join(SERVER_DIR, 'tests')
TEST_KEY = 'test-not-a-real-key'   # placeholder; only ever sent to the local mock


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def wait_http(url, timeout=15.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status < 500:
                    return True
        except Exception:
            time.sleep(0.15)
    raise RuntimeError('did not come up: ' + url)


class Proc:
    def __init__(self, args, log_path, env=None, cwd=None, ready_url=None):
        self.log_path = log_path
        self.log = open(log_path, 'w')
        self.p = subprocess.Popen(args, stdout=self.log, stderr=subprocess.STDOUT, env=env, cwd=cwd)
        if ready_url:
            try:
                wait_http(ready_url)
            except Exception:
                self.stop()
                raise

    def text(self):
        self.log.flush()
        with open(self.log_path) as f:
            return f.read()

    def stop(self):
        if self.p.poll() is None:
            self.p.terminate()
            try:
                self.p.wait(8)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait(5)
        self.log.close()


def start_mock(port, log_path):
    return Proc([sys.executable, os.path.join(TESTS_DIR, 'mock_claude.py'), '--port', str(port)], log_path, ready_url=f'http://127.0.0.1:{port}/_events')


def start_server(port, log_path, db_path, mock_port=None, key=TEST_KEY, **extra_env):
    env = {k: v for k, v in os.environ.items() if k not in ('ANTHROPIC_API_KEY', 'FAKE_ANTHROPIC_URL', 'DB_PATH', 'DAILY_CAP', 'RL_PER_10MIN', 'ALLOWED_ORIGINS', 'MODEL', 'EFFORT', 'UPSTREAM_TOTAL_TIMEOUT', 'RAILWAY_VOLUME_MOUNT_PATH', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_BLOB_API_URL', 'CHAT_LOG')}
    env['DB_PATH'] = db_path
    env['PYTHONUNBUFFERED'] = '1'
    if mock_port:
        env['FAKE_ANTHROPIC_URL'] = f'http://127.0.0.1:{mock_port}'
    if key:
        env['ANTHROPIC_API_KEY'] = key
    env.update({k: str(v) for k, v in extra_env.items()})
    args = [sys.executable, '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', str(port)]
    return Proc(args, log_path, env=env, cwd=SERVER_DIR, ready_url=f'http://127.0.0.1:{port}/health')
