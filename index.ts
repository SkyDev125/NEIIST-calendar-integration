import "dotenv/config";

// Spawn processor worker
const processor = new Worker(new URL("./auxiliary/processor-worker.ts", import.meta.url).href);

// Start webhook server
const PORT = process.env.PORT;
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES);
if (!PORT) {
    throw new Error("[webhook] PORT not defined in environment");
}
if (isNaN(Number(MAX_BODY_BYTES))) {
    throw new Error("[webhook] MAX_BODY_BYTES must be a number");
}

Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);

        if (req.method === "POST" && url.pathname === "/") {
            try {
                const text = await req.text();

                // Verify payload size
                if (text.length > MAX_BODY_BYTES) {
                    return new Response("payload too large", { status: 413 });
                }

                // Send payload to worker
                const payload = JSON.parse(text);
                processor.postMessage({ payload, receivedAt: Date.now() });

                return Response.json({ ok: true });
            } catch (e) {
                return new Response("invalid json", { status: 400 });
            }
        }
        return new Response("not found", { status: 404 });
    },
});

console.log(`[webhook] listening on http://localhost:${PORT}`);

