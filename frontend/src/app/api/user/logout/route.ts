import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Logout endpoint - proxies logout request to backend
 * This endpoint exists so frontend logout() calls don't get 404
 */
export async function POST(request: NextRequest) {
  try {
    // Get authorization header from request
    const authHeader = request.headers.get('authorization');

    // Call backend logout endpoint
    const response = await fetch(`${BACKEND_URL}/api/user/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[Logout API] Backend logout failed:', response.status);
      // Still return success to frontend - local logout should proceed
      return NextResponse.json(
        { message: 'Logged out locally' },
        { status: 200 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });

  } catch (error) {
    console.error('[Logout API] Error calling backend:', error);
    // Return success anyway - frontend should clear local state
    return NextResponse.json(
      { message: 'Logged out locally (backend unreachable)' },
      { status: 200 }
    );
  }
}
