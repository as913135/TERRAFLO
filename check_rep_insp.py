import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('New Pipe/js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if any(k in l.lower() for k in ['recordinspection', 'addrepair', 'verifysite', 'completeinspection', 'logrepair']):
        print(f"{i+1}: {l.strip()}")
