import { NextResponse } from 'next/server';

export async function POST() {
    // TODO: implement telemetry click tracking
    return NextResponse.json({ ok: true });
}
