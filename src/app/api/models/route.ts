import { jsonOk, modelsCatalog } from "@/lib/api/http";

export async function GET() {
  return jsonOk({ models: modelsCatalog() });
}
