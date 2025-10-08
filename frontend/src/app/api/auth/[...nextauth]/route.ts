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
              accessToken: token
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
          // Using relative path - Next.js rewrites will proxy to backend
          const response = await fetch('/api/auth/google', {
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
            // Store our backend token in the user object
            user.accessToken = data.token
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
      if (user) {
        token.accessToken = user.accessToken
      }
      return token
    },
    async session({ session, token }) {
      session.user.accessToken = token.accessToken
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }