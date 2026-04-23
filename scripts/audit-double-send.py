"""
Audit API route handlers for double-send risk.
Flags files where a non-returned res.json/send is followed by another send.
"""
import os, re

api_dir = 'src/server/api'
issues = []

for root, dirs, files in os.walk(api_dir):
    for fname in files:
        if not fname.endswith('.ts'):
            continue
        path = os.path.join(root, fname)
        with open(path) as f:
            lines = f.readlines()

        send_lines = []
        for i, line in enumerate(lines, 1):
            s = line.strip()
            if re.search(r'res\.(json|send|status)\(', s):
                returned = s.startswith('return ')
                send_lines.append((i, returned, s[:90]))

        for idx, (lineno, returned, text) in enumerate(send_lines):
            if not returned and idx < len(send_lines) - 1:
                next_lineno, _, next_text = send_lines[idx + 1]
                issues.append(f'{path}:{lineno}')
                issues.append(f'  non-returned: {text}')
                issues.append(f'  next send L{next_lineno}: {next_text}')

if issues:
    print('\n'.join(issues[:90]))
else:
    print('CLEAN: no double-send patterns found')
