// Hits a local salve-push-server (default http://localhost:8080) and
// renders raw JSON — just enough to sanity-check the server manually
// during development, until releases/rollout UI is worth building here.
const SERVER_URL = import.meta.env.VITE_SALVE_PUSH_SERVER_URL ?? "http://localhost:8080";

async function main() {
  const output = document.getElementById("output")!;
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    output.textContent = JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    output.textContent = `Failed to reach ${SERVER_URL}: ${String(err)}`;
  }
}

main();
