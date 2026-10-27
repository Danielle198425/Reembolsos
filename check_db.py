import sqlite3
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('reembolsos.db')
c = conn.cursor()

print('=== ALL TABLES ===')
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
for r in c.fetchall(): print(r)

print()
print('=== USERS ===')
c.execute('SELECT id, name, email, role, active FROM users')
for r in c.fetchall(): print(r)

print()
print('=== CATEGORIES ===')
c.execute('SELECT id, name, icon, active FROM categories')
for r in c.fetchall(): print(r)

print()
print('=== COST CENTERS ===')
c.execute('SELECT id, code, name, active FROM cost_centers')
for r in c.fetchall(): print(r)

print()
print('=== EXPENSES count ===')
c.execute('SELECT COUNT(*) FROM expenses')
print(c.fetchone())

print()
print('=== JOB ROLES ===')
try:
    c.execute('SELECT * FROM job_roles')
    for r in c.fetchall(): print(r)
except Exception as e:
    print('Error:', e)

print()
print('=== JOB FUNCTIONS ===')
try:
    c.execute('SELECT * FROM job_functions')
    for r in c.fetchall(): print(r)
except Exception as e:
    print('Error:', e)

print()
print('=== POLICIES ===')
try:
    c.execute('SELECT * FROM policies')
    for r in c.fetchall(): print(r)
except Exception as e:
    print('Error:', e)

print()
print('=== MILEAGE RATES ===')
try:
    c.execute('SELECT * FROM mileage_rates')
    for r in c.fetchall(): print(r)
except Exception as e:
    print('No mileage_rates table:', e)

conn.close()
