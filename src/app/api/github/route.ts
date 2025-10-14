// src/app/api/github/route.ts
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/clerk-sdk-node"; 
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch GitHub OAuth tokens
  const tokensRes = await clerkClient.users.getUserOauthAccessToken(userId, "github");

  const githubToken = tokensRes.data[0]; // 👈 pick the first token

  if (!githubToken) {
    return NextResponse.json({ error: "No GitHub token found" }, { status: 404 });
  }

  const repoRes = await fetch("https://api.github.com/user/repos", {
    headers: {
      Authorization: `Bearer ${githubToken.token}`, // ✅ now valid
      Accept: "application/vnd.github+json",
    },
  });

  const repos = await repoRes.json();

  return NextResponse.json({ repos });
}
