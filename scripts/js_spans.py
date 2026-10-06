"""Find prose spans (string/template-literal text) in JavaScript so copy passes never touch code.
prose_spans(js) -> list of (start, end) covering the *contents* of '...', "..." and `...` literals,
excluding ${...} expressions inside templates, comments, and regex literals (all treated as code)."""
import re

def prose_spans(js):
    spans = []
    i, n = 0, len(js)
    prev_sig = ''   # previous significant (non-space) char, to decide regex vs division
    def scan_template(i):
        # js[i] == '`' ; returns index after closing backtick, appending prose spans
        i += 1; start = i
        while i < n:
            c = js[i]
            if c == '\\': i += 2; continue
            if c == '`':
                spans.append((start, i)); return i + 1
            if c == '$' and i + 1 < n and js[i+1] == '{':
                spans.append((start, i)); i += 2
                depth = 1
                while i < n and depth:
                    c2 = js[i]
                    if c2 in '\'"': i = scan_string(i, c2); continue
                    if c2 == '`': i = scan_template(i); continue
                    if c2 == '{': depth += 1
                    elif c2 == '}': depth -= 1
                    i += 1
                start = i; continue
            i += 1
        spans.append((start, n)); return n
    def scan_string(i, q):
        i += 1; start = i
        while i < n:
            c = js[i]
            if c == '\\': i += 2; continue
            if c == q or c == '\n':
                spans.append((start, i)); return i + 1
            i += 1
        spans.append((start, n)); return n
    while i < n:
        c = js[i]
        if c in ' \t\r\n': i += 1; continue
        if c == '/' and i + 1 < n and js[i+1] == '/':
            j = js.find('\n', i); i = n if j < 0 else j + 1; continue
        if c == '/' and i + 1 < n and js[i+1] == '*':
            j = js.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"': i = scan_string(i, c); prev_sig = '"'; continue
        if c == '`': i = scan_template(i); prev_sig = '`'; continue
        if c == '/':
            # regex literal if previous significant char cannot end an expression
            if prev_sig == '' or prev_sig in '(,=:[!&|?{};+-*%<>~^' or prev_sig == 'return':
                i += 1; cls = False
                while i < n:
                    c2 = js[i]
                    if c2 == '\\': i += 2; continue
                    if c2 == '\n': break
                    if cls:
                        if c2 == ']': cls = False
                    elif c2 == '[': cls = True
                    elif c2 == '/': i += 1; break
                    i += 1
                while i < n and js[i].isalpha(): i += 1
                prev_sig = ')'; continue
            prev_sig = '/'; i += 1; continue
        if c.isalnum() or c == '_' or c == '$':
            j = i
            while j < n and (js[j].isalnum() or js[j] in '_$'): j += 1
            word = js[i:j]; prev_sig = 'return' if word in ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw') else 'a'
            i = j; continue
        prev_sig = c; i += 1
    return spans

def html_script_blocks(html):
    """Spans of inline <script> bodies (module or classic)."""
    out = []
    for m in re.finditer(r'<script\b[^>]*>(.*?)</script>', html, re.S | re.I):
        if 'src=' in m.group(0)[:200].lower().split('>')[0]: continue
        out.append((m.start(1), m.end(1)))
    return out

if __name__ == '__main__':
    t = "const playbook = x.platform; // platform\nconst s = 'the playbook' + `six platforms ${platform.name} ok` + /playbook|plan/i.test(q);"
    for a, b in prose_spans(t): print(repr(t[a:b]))
