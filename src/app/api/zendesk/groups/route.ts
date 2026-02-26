import { NextRequest, NextResponse } from "next/server";

export interface ZendeskGroup {
  id: number;
  name: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { subdomain, email, apiToken } = body as Record<string, string>;

  if (!subdomain?.trim() || !email?.trim() || !apiToken?.trim()) {
    return NextResponse.json(
      { error: "subdomain, email, and apiToken are required" },
      { status: 400 }
    );
  }

  const credentials = Buffer.from(`${email}/token:${apiToken}`).toString("base64");

  try {
    const response = await fetch(
      `https://${subdomain}.zendesk.com/api/v2/groups.json`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return NextResponse.json(
        { error: `Zendesk API error ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const groups: ZendeskGroup[] = (data.groups ?? []).map(
      (g: { id: number; name: string }) => ({ id: g.id, name: g.name })
    );

    return NextResponse.json({ groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
