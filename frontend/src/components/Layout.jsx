import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import AnimatedBackground from "./AnimatedBackground";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#050508] relative">
      <AnimatedBackground />
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <Navbar />
        <main className="flex-1 px-6 md:px-10 py-8 md:py-12 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
