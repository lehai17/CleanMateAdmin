import fs from "node:fs";
const file = new URL("../test-results/system-host-cleanup.json", import.meta.url);
export default async () => {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  try { await fetch("http://127.0.0.1:13000/__system-tests/shutdown", { method: "POST", signal: AbortSignal.timeout(5000) }); }
  catch (error) { if (error.cause?.code === "ECONNREFUSED") return; throw error; }
  for (let index = 0; index < 200; index++) {
    if (fs.existsSync(file)) {
      try {
        const result = JSON.parse(fs.readFileSync(file, "utf8"));
        if (result.cleaned && result.database.startsWith("CleanMateSystemTests_")) return;
      } catch (error) {
        // The host may still be writing its marker; retry until it is complete.
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("The isolated system-test database was not cleaned up.");
};
