import Link from 'next/link'
export default function VerifyEmail() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#66b539]">
      <div className="w-full max-w-md space-y-8 bg-[#e8f7dd] p-8 rounded-lg shadow-2xl text-center">
        <div className='flex flex-col items-center'>
          <div className='flex flex-row text-black text-3xl font-bold'>
            <p>Polaris</p>
          </div>
          <h2 className="text-center text-2xl font-medium text-[#151b1f]">Check your email</h2>
        </div>
        <p className="text-[#151b1f]">
          We've sent you an email with a link to verify your account.
          Please check your inbox and follow the instructions.
        </p>
        <Link href="/auth/signin" className="text-blue-500 hover:text-blue-600">
                  Sign in
                </Link>
      </div>
    </div>
  )
}