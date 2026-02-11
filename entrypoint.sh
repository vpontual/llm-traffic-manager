#!/bin/sh
# Start the Next.js dashboard and the Ollama proxy in parallel
node server.js &
node proxy.js &
wait -n
