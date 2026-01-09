import sqlite3

conn = sqlite3.connect(r"C:\Users\prosp\Desktop\Axon\axon.db")
cursor = conn.cursor()
cursor.execute("SELECT * FROM iq_credentials")
rows = cursor.fetchall()
print(f"Found {len(rows)} rows:")
for row in rows:
    print(row)
conn.close()
