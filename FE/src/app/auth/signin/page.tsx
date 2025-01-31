"use client"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

export default function SignIn() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-r from-teal-500 to-emerald-500">
      <div className="w-full max-w-md space-y-8 bg-[#e8f7dd] p-8 rounded-lg shadow-2xl">
        <div className='flex flex-col items-center'>
        <div className="flex flex-row bg-gradient-to-r from-teal-700 to-emerald-700 bg-clip-text text-transparent text-3xl font-bold">
          <p>Polaris</p>
        </div>
          <h2 className="text-center text-2xl font-medium text-[#151b1f]">Sign in to your account</h2>
          <div className="relative py-4">            
            <div className="relative flex justify-center text-sm">
              <p className="mt-2 text-center text-[#151b1f]">
                Don't have an account?{' '}
                <Link href="/auth/signup" className="text-blue-500 hover:text-blue-600">
                  Sign up
                </Link>
              </p>
            </div>
          </div>         
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-black border-black">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border text-black border-black px-3 py-2"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border text-black border-black px-3 py-2"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="w-full bg-teal-500 text-white py-2 px-4 rounded-md hover:bg-emerald-500 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Currently signing in...' : 'Sign In'}
          </button>
        </form>

        

        
      </div>
    </div>
  )
}