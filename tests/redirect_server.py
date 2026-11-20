"""A local host that redirects /index.html to / (as Netlify does).
For: python3 tests/redirect_server.py & BASE=http://localhost:8778/ python3 tests/test_app.py offline"""
import functools, http.server, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/index.html':
            self.send_response(301); self.send_header('Location', '/'); self.end_headers(); return
        return super().do_GET()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8778), functools.partial(H, directory=ROOT)).serve_forever()
