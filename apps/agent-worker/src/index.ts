const defaultPort = 9102;
const port = Math.trunc(
  Number(process.env.AGENT_WORKER_PORT ?? String(defaultPort))
);
const nodeHttp = process.getBuiltinModule("node:http") as {
  createServer: (
    listener: (
      request: { url?: string },
      response: {
        end: (body: string) => void;
        setHeader: (name: string, value: string) => void;
        statusCode: number;
      }
    ) => void
  ) => { listen: (listenPort: number, callback: () => void) => void };
};

const server = nodeHttp.createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.url !== "/health") {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  response.statusCode = 200;
  response.end(JSON.stringify({ service: "agent-worker", status: "ok" }));
});

server.listen(port, () => {
  process.stdout.write(`agent-worker listening on http://127.0.0.1:${port}\n`);
});
