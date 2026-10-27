export default function InviteAcceptPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111827] text-[#F3F4F6] px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-light mb-4">Invitation</h1>
        <p className="text-[#AAB6C8] mb-6">
          Invitation acceptance will be wired up after Supabase is configured.
        </p>
        <a
          href="/login"
          className="text-[#D8C6A1] hover:underline"
        >
          Go to sign in
        </a>
      </div>
    </div>
  )
}