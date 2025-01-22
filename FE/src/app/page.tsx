"use client"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Map from "@/components/map"
import Sidebar from "@/components/sidebar"
import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { Database } from '@/Types'

export default function Home() {
  const router = useRouter()
  const supabase = createClientComponentClient<Database>()
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error fetching session:', error)
        return
      }

      if (!session) { // Check for sign in
        router.push('/auth/signin')
        return
      }
      setUser(session.user)
      setLoading(false)
    }

    getUser()
    console.log(user)

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          router.push('/auth/signin')
        } else if (session) {
          setUser(session.user)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, router])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return (
    <div className="flex flex-row h-screen">
      <Sidebar 
        setDestinationCoords={setDestinationCoords}
        user={user}
      />
      <Map 
        destinationCoords={destinationCoords} 
        setDestinationCoords={setDestinationCoords}
      />
    </div>
  )
}