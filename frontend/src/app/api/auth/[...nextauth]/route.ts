import NextAuth from 'next-auth'
import { AuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { authAPI } from '@/lib/api'

const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const response = await authAPI.login(credentials.email, credentials.password)
          const { user, token } = response.data

          if (user && token) {
            return {
              id: user.id,
              email: user.email,
              accessToken: token,
              role: user.role  // FIXED: Include role from backend response
            }
          }
          return null
        } catch (error) {
          return null
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        try {
          // Send Google user data to our backend for verification/creation
          // Use absolute URL for server-side fetch (rewrites don't apply to server requests)
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
          const response = await fetch(`${backendUrl}/api/user/google-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              googleId: user.id,
              image: user.image
            })
          })

          if (response.ok) {
            const data = await response.json()
            // Store our backend token and user data in the user object
            user.accessToken = data.token
            user.id = data.user?.id || user.id
            user.role = data.user?.role
            return true
          }
          return false
        } catch (error) {
          console.error('Google OAuth error:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user, account }) {
      // Initial sign in - user object is present
      if (user) {
        token.accessToken = user.accessToken || token.accessToken
        token.id = user.id || token.id
        // Only update role if user has role (preserve existing if not provided)
        if (user.role !== undefined) {
          token.role = user.role
        }
      }
      // On subsequent calls (token refresh), user is undefined
      // Token already has all fields from previous call - just return it
      return token
    },
    async session({ session, token }) {
      session.user.accessToken = token.accessToken
      session.user.id = token.id as string
      session.user.role = token.role as string
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours - same as backend token expiry
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }