export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111827] text-[#F3F4F6] px-4">
      <main className="max-w-2xl text-center">
        <h1 className="text-4xl md:text-6xl font-light mb-4 tracking-tight">
          Quite Chat
        </h1>
        <p className="text-[#AAB6C8] text-lg mb-10 max-w-lg mx-auto">
          A little space to be yourself. No audience. No pressure. Just a
          conversation, when both people want one.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/login"
            className="px-6 py-3 bg-[#D8C6A1] text-[#111827] font-medium rounded-xl hover:bg-[#e8d6b9] transition-colors"
          >
            Sign in
          </a>
        </div>
      </main>
    </div>
  )
}