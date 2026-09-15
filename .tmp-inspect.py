import sqlite3, glob, os
d = r"C:\Users\paw\Documents\GitHub\mailfare\.wrangler\state\v3\d1\miniflare-D1DatabaseObject"
for f in glob.glob(os.path.join(d, "*.sqlite")):
    try:
        con = sqlite3.connect(f"file:{f}?mode=ro", uri=True)
        cur = con.cursor()
        tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table' and name in ('users','domains','mailboxes','messages')")]
        if not tables:
            con.close(); continue
        print(os.path.basename(f)[:10], tables)
        try:
            for r in cur.execute("select email, role from users limit 5"): print(" user:", r)
        except Exception as e: print(" users err:", e)
        try:
            for r in cur.execute("select hostname, status from domains limit 5"): print(" domain:", r)
        except Exception as e: print(" domains err:", e)
        try:
            for r in cur.execute("select m.local_part, d.hostname from mailboxes m join domains d on m.domain_id = d.id limit 10"): print(" mailbox:", r)
        except Exception as e: print(" mailboxes err:", e)
        con.close()
    except Exception as e:
        print(os.path.basename(f)[:10], "ERR", e)