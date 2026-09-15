const D = require("better-sqlite3");
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const files = [
	"58a5ff6036d2e232a397968f8cf6296670b183e14a864a6e7bb836ef9fad142e.sqlite",
	"e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d.sqlite",
];
for (const f of files) {
	try {
		const db = new D(`${dir}/${f}`, { readonly: true });
		const tables = db
			.prepare(
				"select name from sqlite_master where type='table' and name in ('users','domains','mailboxes')"
			)
			.all()
			.map((x) => x.name);
		console.log(`\n=== ${f.slice(0, 8)} tables: ${tables.join(",")}`);
		try {
			console.log("users:", JSON.stringify(db.prepare("select email,role,created_at from users").all()));
		} catch (e) {
			console.log("users: ERR", e.message);
		}
		try {
			console.log("domains:", JSON.stringify(db.prepare("select hostname,status from domains").all()));
		} catch (e) {}
		try {
			console.log("mailboxes count:", db.prepare("select count(*) c from mailboxes").get().c);
		} catch (e) {}
		db.close();
	} catch (e) {
		console.log(f.slice(0, 8), "ERR", e.message);
	}
}
