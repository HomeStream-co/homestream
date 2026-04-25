import re, sys

path = sys.argv[1]
with open(path, 'r') as f:
    content = f.read()

def resolve_conflicts(text):
    result = []
    lines = text.split('\n')
    in_conflict = False
    in_ours = True
    depth = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r'^<<<<<<< ', line):
            in_conflict = True
            in_ours = True
            depth += 1
            i += 1
            continue
        elif in_conflict and re.match(r'^=======', line) and depth == 1:
            in_ours = False
            i += 1
            continue
        elif in_conflict and re.match(r'^>>>>>>> ', line):
            depth -= 1
            if depth == 0:
                in_conflict = False
                in_ours = True
            i += 1
            continue
        if not in_conflict or in_ours:
            result.append(line)
        i += 1
    return '\n'.join(result)

cleaned = resolve_conflicts(content)
remaining = len(re.findall(r'^<<<<<<< ', cleaned, re.MULTILINE))
print(f"Conflicts remaining: {remaining}, Lines: {len(cleaned.splitlines())}")
with open(path, 'w') as f:
    f.write(cleaned)
