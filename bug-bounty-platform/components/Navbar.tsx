"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user));
  }, [pathname]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-black font-bold text-sm">BB</span>
              </div>
              <span className="text-white font-bold text-lg hidden sm:block">
                BountyBoard
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/programs"
                className="text-gray-300 hover:text-white text-sm transition-colors"
              >
                Programs
              </Link>
              <Link
                href="/leaderboard"
                className="text-gray-300 hover:text-white text-sm transition-colors"
              >
                Leaderboard
              </Link>
              {user && (
                <Link
                  href="/dashboard"
                  className="text-gray-300 hover:text-white text-sm transition-colors"
                >
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-xs font-bold text-black">
                    {user.displayName[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:block">{user.displayName}</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-1">
                    <div className="px-4 py-2 border-b border-gray-700">
                      <p className="text-sm font-medium text-white">{user.displayName}</p>
                      <p className="text-xs text-gray-400">@{user.username}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-900 text-green-300 rounded">
                        {user.role}
                      </span>
                    </div>
                    <Link
                      href="/dashboard"
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                      onClick={() => setMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    {user.role === "company" && (
                      <Link
                        href="/dashboard/company/programs/new"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                        onClick={() => setMenuOpen(false)}
                      >
                        New Program
                      </Link>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); handleLogout(); }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="text-gray-300 hover:text-white text-sm px-3 py-2 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="bg-green-500 hover:bg-green-400 text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
