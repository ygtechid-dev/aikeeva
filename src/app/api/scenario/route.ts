import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonError, jsonOk, readJson } from "@/lib/api/http";
import {
  ScenarioError,
  assertScenarioInput,
  generateScenario,
  type ScenarioRequest,
} from "@/lib/openai/scenario";

type Body = Partial<ScenarioRequest>;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await readJson<Body>(request);

    const input: ScenarioRequest = {
      prompt: String(body.prompt ?? ""),
      duration: Number(body.duration ?? 30),
      style: body.style ? String(body.style) : undefined,
      language: body.language ? String(body.language) : undefined,
      voiceTone: body.voiceTone ? String(body.voiceTone) : undefined,
      template: body.template ? String(body.template) : undefined,
      sceneLength: body.sceneLength ? Number(body.sceneLength) : undefined,
    };

    assertScenarioInput(input);

    const result = await generateScenario(input);
    return jsonOk({
      scenes: result.scenes,
      usage: result.usage,
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error.message, error.status);
    if (error instanceof ScenarioError) return jsonError(error.message, error.status);
    console.error("scenario generation failed", error);
    return jsonError("Terjadi kesalahan pada server.", 500);
  }
}
