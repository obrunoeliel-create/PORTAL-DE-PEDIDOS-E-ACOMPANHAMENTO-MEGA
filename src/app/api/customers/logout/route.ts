import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, customerCookieOptions } from "@/lib/customer-session";

// "Não é você? Sair": esquece o cadastro neste aparelho.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOMER_COOKIE, "", { ...customerCookieOptions, maxAge: 0 });
  return res;
}
