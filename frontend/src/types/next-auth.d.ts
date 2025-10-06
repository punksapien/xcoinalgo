import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    accessToken?: string
  }

  interface Session {
    accessToken?: string
    user: {
      id?: string
      email?: string | null
      name?: string | null
      image?: string | null
      accessToken?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
  }
}
