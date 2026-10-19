import { connection } from "next/server";
import { NextResponse } from "next/server";

// `connection()` opts out of static prerendering so the env var is read at request time.
export async function GET() {
  await connection();
  return NextResponse.json({ llm: Boolean(process.env.ANTHROPIC_API_KEY) });
}
