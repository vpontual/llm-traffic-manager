// Ollama pull/delete client: sends HTTP requests to Ollama servers

export interface ModelOperationResult {
  success: boolean;
  statusCode: number;
  detail: string;
}

// POST http://{host}/api/pull with { model, stream: false }
// 10-minute timeout (large models take a while to pull)
export async function pullModel(
  host: string,
  modelName: string
): Promise<ModelOperationResult> {
  try {
    const res = await fetch(`${host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, stream: false }),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    const text = await res.text();
    return {
      success: res.ok,
      statusCode: res.status,
      detail: res.ok ? "Pull completed" : text.slice(0, 500),
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// DELETE http://{host}/api/delete with { model }
// 30-second timeout (deletes are fast)
export async function deleteModel(
  host: string,
  modelName: string
): Promise<ModelOperationResult> {
  try {
    const res = await fetch(`${host}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    return {
      success: res.ok,
      statusCode: res.status,
      detail: res.ok ? "Model deleted" : text.slice(0, 500),
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
