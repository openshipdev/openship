import { NextResponse } from "next/server.js";

export const openShipReadHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export function openShipJson(value) {
  return NextResponse.json(value, { headers: openShipReadHeaders });
}
